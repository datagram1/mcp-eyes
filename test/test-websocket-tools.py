#!/usr/bin/env python3
"""
Test Desktop Tools via WebSocket
Connects to the WebSocket server and sends tool execution requests to the agent
"""

import asyncio
import json
import websockets
import uuid
import argparse

# WebSocket server URL
WS_URL = "wss://screencontrol.knws.co.uk/ws"

# Agent details (from getState)
ENDPOINT_UUID = "cmivv9aar000310vcfp9lg0qj"
CUSTOMER_ID = "cmivqj7nk000054pkib1rkjdb"


async def send_tool_request(tool_name, arguments=None):
    """Send a tool execution request via WebSocket and wait for response"""
    if arguments is None:
        arguments = {}

    try:
        print(f"\n{'='*60}")
        print(f"Testing: {tool_name}")
        print(f"Arguments: {json.dumps(arguments)}")
        print(f"{'='*60}")

        async with websockets.connect(WS_URL) as websocket:
            # Register as the control server
            register_msg = {
                "type": "register",
                "role": "server",
                "endpointUuid": ENDPOINT_UUID
            }
            await websocket.send(json.dumps(register_msg))
            print("✓ Registered as server")

            # Wait for registration response
            response = await websocket.recv()
            reg_response = json.loads(response)
            print(f"  Registration response: {reg_response.get('type')}")

            # Send tool execution request
            request_id = str(uuid.uuid4())
            tool_request = {
                "type": "request",
                "id": request_id,
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments
                }
            }
            await websocket.send(json.dumps(tool_request))
            print(f"→ Sent tool request (ID: {request_id[:8]}...)")

            # Wait for response (with timeout)
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                result = json.loads(response)

                print(f"\n← Received response:")
                if result.get("type") == "response":
                    if "error" in result.get("result", {}):
                        print(f"  ✗ Error: {result['result']['error']}")
                        return False
                    else:
                        # Truncate large results (like screenshots)
                        result_str = json.dumps(result.get("result", {}), indent=2)
                        if len(result_str) > 500:
                            print(f"  ✓ Success (result truncated):")
                            print(f"  {result_str[:500]}...")
                        else:
                            print(f"  ✓ Success:")
                            print(f"  {result_str}")
                        return True
                else:
                    print(f"  ? Unexpected response type: {result.get('type')}")
                    print(f"  {json.dumps(result, indent=2)}")
                    return False

            except asyncio.TimeoutError:
                print(f"  ✗ Timeout waiting for response")
                return False

    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


async def run_tests():
    """Run all desktop tool tests"""
    print("🧪 Testing Desktop Tools via WebSocket")
    print(f"Server: {WS_URL}")
    print(f"Endpoint: {ENDPOINT_UUID}")

    passed = 0
    failed = 0

    # Test 1: desktop_list_applications
    if await send_tool_request("desktop_list_applications"):
        passed += 1
    else:
        failed += 1

    await asyncio.sleep(1)

    # Test 2: desktop_screenshot
    if await send_tool_request("desktop_screenshot"):
        passed += 1
    else:
        failed += 1

    await asyncio.sleep(1)

    # Test 3: desktop_press_key (safe key)
    if await send_tool_request("desktop_press_key", {"key": "escape"}):
        passed += 1
    else:
        failed += 1

    # Summary
    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*60}")

    if failed > 0:
        print("\n❌ Some tests failed")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Test desktop tools via WebSocket')
    parser.add_argument('--tool', help='Test a specific tool only')
    parser.add_argument('--args', help='Tool arguments as JSON string')
    args = parser.parse_args()

    if args.tool:
        # Test single tool
        tool_args = json.loads(args.args) if args.args else {}
        success = asyncio.run(send_tool_request(args.tool, tool_args))
        exit(0 if success else 1)
    else:
        # Run all tests
        exit(asyncio.run(run_tests()))
