#!/usr/bin/env python3
"""
Claude MCP Client Test Script

Simulates how Claude connects to an MCP server via OAuth 2.0.
Based on actual Claude requests observed in Apache logs.

The flow is:
1. Discover OAuth metadata (.well-known/oauth-authorization-server)
2. Register client dynamically (if needed)
3. Get access token (requires manual consent or existing token)
4. Send MCP JSON-RPC requests (initialize, tools/list, etc.)

Usage:
    # Test with existing access token:
    python claude_mcp_test.py --token <access_token> --endpoint <uuid>

    # Full OAuth flow (requires manual consent):
    python claude_mcp_test.py --full-flow --endpoint <uuid>

    # Just discover metadata:
    python claude_mcp_test.py --discover-only
"""

import argparse
import json
import sys
import hashlib
import base64
import secrets
from urllib.parse import urlencode, urlparse, parse_qs

try:
    import httpx
except ImportError:
    print("Please install httpx: pip install httpx")
    sys.exit(1)


class ClaudeMCPClient:
    """Simulates Claude's MCP client behavior."""

    def __init__(self, base_url: str, endpoint_uuid: str = None, verbose: bool = True):
        self.base_url = base_url.rstrip('/')
        self.endpoint_uuid = endpoint_uuid
        self.verbose = verbose
        self.access_token = None
        self.refresh_token = None
        self.client_id = None
        self.client_secret = None
        self.oauth_metadata = None

        # Client setup matching Claude's behavior
        self.client = httpx.Client(
            headers={
                "User-Agent": "Claude-User",  # Claude's actual user-agent
                "Accept": "application/json",
            },
            timeout=30.0,
            follow_redirects=False
        )

        # Separate client for OAuth (uses httpx user-agent like Claude)
        self.oauth_client = httpx.Client(
            headers={
                "User-Agent": "python-httpx/0.27.2",
                "Accept": "application/json",
            },
            timeout=30.0,
            follow_redirects=True
        )

    def log(self, message: str):
        """Print message if verbose."""
        if self.verbose:
            print(message)

    def discover_oauth_metadata(self) -> dict:
        """Discover OAuth 2.0 authorization server metadata."""
        self.log("\n=== OAuth Discovery ===")
        url = f"{self.base_url}/.well-known/oauth-authorization-server"
        self.log(f"GET {url}")

        response = self.oauth_client.get(url)
        self.log(f"Status: {response.status_code}")

        if response.status_code != 200:
            self.log(f"Error: {response.text[:500]}")
            return None

        self.oauth_metadata = response.json()
        self.log(f"Issuer: {self.oauth_metadata.get('issuer')}")
        self.log(f"Token Endpoint: {self.oauth_metadata.get('token_endpoint')}")
        self.log(f"Authorization Endpoint: {self.oauth_metadata.get('authorization_endpoint')}")
        return self.oauth_metadata

    def discover_protected_resource(self) -> dict:
        """Discover OAuth 2.0 protected resource metadata."""
        self.log("\n=== Protected Resource Discovery ===")
        if self.endpoint_uuid:
            url = f"{self.base_url}/.well-known/oauth-protected-resource/mcp/{self.endpoint_uuid}"
        else:
            url = f"{self.base_url}/.well-known/oauth-protected-resource"
        self.log(f"GET {url}")

        response = self.oauth_client.get(url)
        self.log(f"Status: {response.status_code}")

        if response.status_code != 200:
            self.log(f"Error: {response.text[:500]}")
            return None

        return response.json()

    def register_client(self, redirect_uri: str = "https://claude.ai/api/mcp/auth_callback") -> dict:
        """Dynamically register OAuth client (RFC 7591)."""
        if not self.oauth_metadata:
            self.discover_oauth_metadata()

        registration_endpoint = self.oauth_metadata.get('registration_endpoint')
        if not registration_endpoint:
            self.log("No registration endpoint available")
            return None

        self.log("\n=== Dynamic Client Registration ===")
        self.log(f"POST {registration_endpoint}")

        # Generate PKCE values
        code_verifier = secrets.token_urlsafe(32)
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()
        ).decode().rstrip('=')

        registration_data = {
            "client_name": "Claude MCP Test Client",
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "client_secret_post",
            "scope": "mcp:tools mcp:resources mcp:prompts mcp:agents:read mcp:agents:write"
        }

        response = self.oauth_client.post(
            registration_endpoint,
            json=registration_data
        )

        self.log(f"Status: {response.status_code}")

        if response.status_code in [200, 201]:
            data = response.json()
            self.client_id = data.get('client_id')
            self.client_secret = data.get('client_secret')
            self.log(f"Client ID: {self.client_id}")
            return data
        else:
            self.log(f"Registration failed: {response.text[:500]}")
            return None

    def generate_pkce(self) -> tuple:
        """Generate PKCE code verifier and challenge."""
        code_verifier = secrets.token_urlsafe(32)
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()
        ).decode().rstrip('=')
        return code_verifier, code_challenge

    def get_authorization_url(self, redirect_uri: str = "https://claude.ai/api/mcp/auth_callback") -> tuple:
        """Generate authorization URL with PKCE."""
        if not self.oauth_metadata:
            self.discover_oauth_metadata()

        if not self.client_id:
            self.register_client(redirect_uri)

        code_verifier, code_challenge = self.generate_pkce()
        state = secrets.token_urlsafe(32)

        resource = f"{self.base_url}/mcp"
        if self.endpoint_uuid:
            resource = f"{self.base_url}/mcp/{self.endpoint_uuid}"

        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "scope": "mcp:tools mcp:resources mcp:prompts mcp:agents:read mcp:agents:write",
            "resource": resource
        }

        auth_url = f"{self.oauth_metadata['authorization_endpoint']}?{urlencode(params)}"
        return auth_url, code_verifier, state

    def exchange_code(self, code: str, code_verifier: str,
                      redirect_uri: str = "https://claude.ai/api/mcp/auth_callback") -> dict:
        """Exchange authorization code for tokens."""
        self.log("\n=== Token Exchange ===")
        token_endpoint = self.oauth_metadata['token_endpoint']
        self.log(f"POST {token_endpoint}")

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": self.client_id,
            "code_verifier": code_verifier,
        }

        if self.client_secret:
            data["client_secret"] = self.client_secret

        response = self.oauth_client.post(
            token_endpoint,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        self.log(f"Status: {response.status_code}")

        if response.status_code == 200:
            tokens = response.json()
            self.access_token = tokens.get('access_token')
            self.refresh_token = tokens.get('refresh_token')
            self.log(f"Access Token: {self.access_token[:50]}..." if self.access_token else "No access token")
            return tokens
        else:
            self.log(f"Token exchange failed: {response.text[:500]}")
            return None

    def set_token(self, access_token: str):
        """Set access token directly."""
        self.access_token = access_token

    def mcp_request(self, method: str, params: dict = None, id: int = 1) -> dict:
        """Send MCP JSON-RPC request."""
        if not self.access_token:
            self.log("Error: No access token set")
            return None

        if not self.endpoint_uuid:
            self.log("Error: No endpoint UUID set")
            return None

        url = f"{self.base_url}/mcp/{self.endpoint_uuid}"

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "id": id
        }
        if params:
            payload["params"] = params

        self.log(f"\n=== MCP Request: {method} ===")
        self.log(f"POST {url}")
        self.log(f"Payload: {json.dumps(payload, indent=2)}")

        response = self.client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
                "User-Agent": "Claude-User"  # Match Claude's user agent
            }
        )

        self.log(f"Status: {response.status_code}")

        try:
            result = response.json()
            self.log(f"Response: {json.dumps(result, indent=2)}")
            return result
        except:
            self.log(f"Response (raw): {response.text[:500]}")
            return {"error": response.text}

    def initialize(self) -> dict:
        """Send MCP initialize request."""
        return self.mcp_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": {"listChanged": True},
                "sampling": {}
            },
            "clientInfo": {
                "name": "Claude",
                "version": "1.0.0"
            }
        })

    def initialized_notification(self) -> dict:
        """Send MCP initialized notification."""
        url = f"{self.base_url}/mcp/{self.endpoint_uuid}"
        payload = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }

        self.log(f"\n=== MCP Notification: initialized ===")

        response = self.client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json"
            }
        )
        self.log(f"Status: {response.status_code}")
        return {"status": response.status_code}

    def list_tools(self) -> dict:
        """Send MCP tools/list request."""
        return self.mcp_request("tools/list")

    def list_resources(self) -> dict:
        """Send MCP resources/list request."""
        return self.mcp_request("resources/list")

    def list_prompts(self) -> dict:
        """Send MCP prompts/list request."""
        return self.mcp_request("prompts/list")

    def call_tool(self, name: str, arguments: dict = None) -> dict:
        """Call an MCP tool."""
        params = {"name": name}
        if arguments:
            params["arguments"] = arguments
        return self.mcp_request("tools/call", params)

    def close(self):
        """Close HTTP clients."""
        self.client.close()
        self.oauth_client.close()


def run_full_flow(args):
    """Run full OAuth + MCP flow."""
    client = ClaudeMCPClient(args.server, args.endpoint, verbose=True)

    try:
        # Step 1: Discover OAuth metadata
        metadata = client.discover_oauth_metadata()
        if not metadata:
            print("\nFailed to discover OAuth metadata")
            return 1

        # Step 2: Discover protected resource
        resource = client.discover_protected_resource()
        if resource:
            print(f"\nResource: {json.dumps(resource, indent=2)}")

        # Step 3: Register client
        client.register_client()

        # Step 4: Generate authorization URL
        auth_url, code_verifier, state = client.get_authorization_url()

        print(f"\n{'='*60}")
        print("AUTHORIZATION REQUIRED")
        print('='*60)
        print(f"\n1. Open this URL in your browser:\n\n{auth_url}\n")
        print("2. Log in and approve the consent")
        print("3. Copy the 'code' parameter from the redirect URL")
        print("4. Enter it below:\n")

        code = input("Authorization code: ").strip()

        if not code:
            print("No code provided, exiting")
            return 1

        # Step 5: Exchange code for tokens
        tokens = client.exchange_code(code, code_verifier)
        if not tokens:
            print("\nToken exchange failed")
            return 1

        print(f"\n{'='*60}")
        print("MCP COMMUNICATION")
        print('='*60)

        # Step 6: Initialize MCP session
        init_result = client.initialize()

        # Step 7: Send initialized notification
        client.initialized_notification()

        # Step 8: List tools
        tools = client.list_tools()

        if tools and 'result' in tools:
            print(f"\n{'='*60}")
            print(f"AVAILABLE TOOLS ({len(tools['result'].get('tools', []))})")
            print('='*60)
            for tool in tools['result'].get('tools', []):
                print(f"\n- {tool.get('name')}")
                print(f"  Description: {tool.get('description', 'N/A')}")

        return 0

    finally:
        client.close()


def run_with_token(args):
    """Run MCP requests with existing token."""
    client = ClaudeMCPClient(args.server, args.endpoint, verbose=True)
    client.set_token(args.token)

    try:
        print(f"\n{'='*60}")
        print("MCP COMMUNICATION (with existing token)")
        print('='*60)

        # Initialize
        init_result = client.initialize()

        # Send initialized notification
        client.initialized_notification()

        # List tools
        tools = client.list_tools()

        if tools and 'result' in tools:
            print(f"\n{'='*60}")
            print(f"AVAILABLE TOOLS ({len(tools['result'].get('tools', []))})")
            print('='*60)
            for tool in tools['result'].get('tools', []):
                print(f"\n- {tool.get('name')}")
                print(f"  Description: {tool.get('description', 'N/A')}")
                if tool.get('inputSchema', {}).get('properties'):
                    print(f"  Parameters: {list(tool['inputSchema']['properties'].keys())}")

        # List resources
        resources = client.list_resources()

        # List prompts
        prompts = client.list_prompts()

        return 0

    finally:
        client.close()


def run_discover_only(args):
    """Just discover OAuth and resource metadata."""
    client = ClaudeMCPClient(args.server, args.endpoint, verbose=True)

    try:
        # OAuth server metadata
        metadata = client.discover_oauth_metadata()
        if metadata:
            print(f"\n{'='*60}")
            print("OAUTH SERVER METADATA")
            print('='*60)
            print(json.dumps(metadata, indent=2))

        # Protected resource metadata
        resource = client.discover_protected_resource()
        if resource:
            print(f"\n{'='*60}")
            print("PROTECTED RESOURCE METADATA")
            print('='*60)
            print(json.dumps(resource, indent=2))

        return 0

    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(
        description="Claude MCP Client Test - simulates Claude's MCP connection flow"
    )
    parser.add_argument(
        "--server",
        default="https://screencontrol.knws.co.uk",
        help="MCP server base URL"
    )
    parser.add_argument(
        "--endpoint",
        help="MCP endpoint UUID (e.g., cmivv9aar000310vcfp9lg0qj)"
    )
    parser.add_argument(
        "--token",
        help="Existing OAuth access token"
    )
    parser.add_argument(
        "--full-flow",
        action="store_true",
        help="Run full OAuth flow (requires manual consent)"
    )
    parser.add_argument(
        "--discover-only",
        action="store_true",
        help="Only discover OAuth metadata"
    )

    args = parser.parse_args()

    if args.discover_only:
        return run_discover_only(args)
    elif args.token:
        if not args.endpoint:
            print("Error: --endpoint required when using --token")
            return 1
        return run_with_token(args)
    elif args.full_flow:
        if not args.endpoint:
            print("Error: --endpoint required for full flow")
            return 1
        return run_full_flow(args)
    else:
        print("Usage examples:")
        print(f"  {sys.argv[0]} --discover-only")
        print(f"  {sys.argv[0]} --full-flow --endpoint cmivv9aar000310vcfp9lg0qj")
        print(f"  {sys.argv[0]} --token <token> --endpoint cmivv9aar000310vcfp9lg0qj")
        return 0


if __name__ == "__main__":
    sys.exit(main())
