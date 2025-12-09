#!/usr/bin/env python3
"""
OAuth 2.0 Manual Test Script

Tests OAuth token exchange with client_secret authentication (confidential client).

Usage:
    1. First, run the authorization flow in browser to get an auth code
    2. Then run this script with the auth code to exchange for tokens

    python oauth_test.py --code <auth_code> --client-id <id> --client-secret <secret>
"""

import argparse
import requests
import json
import sys
from urllib.parse import urlencode

def exchange_auth_code(server_url: str, code: str, client_id: str, client_secret: str, redirect_uri: str):
    """Exchange authorization code for access token using client_secret."""
    token_url = f"{server_url}/api/oauth/token"

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    print(f"\n=== Token Exchange ===")
    print(f"URL: {token_url}")
    print(f"Data: {json.dumps(data, indent=2)}")

    response = requests.post(
        token_url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )

    print(f"\nStatus: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

    return response.json() if response.ok else None

def refresh_token(server_url: str, refresh_tok: str):
    """Refresh an access token."""
    token_url = f"{server_url}/api/oauth/token"

    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_tok,
    }

    print(f"\n=== Token Refresh ===")
    print(f"URL: {token_url}")

    response = requests.post(
        token_url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )

    print(f"\nStatus: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

    return response.json() if response.ok else None

def test_mcp_endpoint(server_url: str, access_token: str, endpoint_uuid: str = None):
    """Test MCP endpoint with access token."""
    if endpoint_uuid:
        mcp_url = f"{server_url}/api/mcp/{endpoint_uuid}"
    else:
        mcp_url = f"{server_url}/api/mcp"

    print(f"\n=== MCP Endpoint Test ===")
    print(f"URL: {mcp_url}")

    # Test tools/list
    response = requests.post(
        mcp_url,
        json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
    )

    print(f"\nStatus: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response: {response.text[:500]}")

    return response.ok

def build_auth_url(server_url: str, client_id: str, redirect_uri: str, scopes: list = None):
    """Build authorization URL for manual browser flow."""
    if scopes is None:
        scopes = ["mcp:tools", "mcp:resources", "mcp:agents:read"]

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
    }

    # Note: confidential clients don't need PKCE
    auth_url = f"{server_url}/api/oauth/authorize?{urlencode(params)}"
    return auth_url

def main():
    parser = argparse.ArgumentParser(description="OAuth 2.0 Manual Test Script")
    parser.add_argument("--server", default="http://localhost:3000", help="Server URL")
    parser.add_argument("--code", help="Authorization code from browser flow")
    parser.add_argument("--client-id", required=True, help="OAuth client ID")
    parser.add_argument("--client-secret", required=True, help="OAuth client secret")
    parser.add_argument("--redirect-uri", default="https://claude.ai/oauth/callback", help="Redirect URI")
    parser.add_argument("--refresh", help="Refresh token to test refresh flow")
    parser.add_argument("--access-token", help="Access token to test MCP endpoint")
    parser.add_argument("--endpoint-uuid", help="MCP endpoint UUID for testing")
    parser.add_argument("--build-url", action="store_true", help="Just print authorization URL")

    args = parser.parse_args()

    if args.build_url:
        url = build_auth_url(args.server, args.client_id, args.redirect_uri)
        print(f"\nOpen this URL in your browser:\n{url}")
        return

    if args.refresh:
        result = refresh_token(args.server, args.refresh)
        if result and "access_token" in result:
            print("\n✅ Token refresh successful!")
            test_mcp_endpoint(args.server, result["access_token"], args.endpoint_uuid)
        return

    if args.access_token:
        test_mcp_endpoint(args.server, args.access_token, args.endpoint_uuid)
        return

    if args.code:
        result = exchange_auth_code(
            args.server,
            args.code,
            args.client_id,
            args.client_secret,
            args.redirect_uri
        )
        if result and "access_token" in result:
            print("\n✅ Token exchange successful!")
            test_mcp_endpoint(args.server, result["access_token"], args.endpoint_uuid)
        return

    # Default: show auth URL
    url = build_auth_url(args.server, args.client_id, args.redirect_uri)
    print(f"\nStep 1: Open this URL in your browser:\n{url}")
    print(f"\nStep 2: After authorization, you'll be redirected with a 'code' parameter.")
    print(f"\nStep 3: Run this script again with the code:")
    print(f"  python {sys.argv[0]} --code <CODE> --client-id {args.client_id} --client-secret {args.client_secret}")

if __name__ == "__main__":
    main()
