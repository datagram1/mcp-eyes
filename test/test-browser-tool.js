// Test browser tool through control server WebSocket
const WebSocket = require('ws');

const ENDPOINT_UUID = 'cmivv9aar000310vcfp9lg0qj';
const WS_URL = 'ws://localhost:3000/ws';

console.log('=== Testing Browser Tool via Control Server ===');
console.log('Connecting to:', WS_URL);
console.log('Endpoint UUID:', ENDPOINT_UUID);
console.log('');

const ws = new WebSocket(WS_URL);

ws.on('open', function open() {
  console.log('✅ WebSocket connected');
  
  const request = {
    type: 'tool_call',
    endpoint_id: ENDPOINT_UUID,
    tool: 'browser_navigate',
    arguments: {
      url: 'https://example.org',
      browser: 'firefox'
    },
    request_id: 'test_browser_' + Date.now()
  };
  
  console.log('\n📤 Sending browser_navigate request:');
  console.log(JSON.stringify(request, null, 2));
  ws.send(JSON.stringify(request));
});

ws.on('message', function incoming(data) {
  console.log('\n📥 Received response:');
  try {
    const response = JSON.parse(data.toString());
    console.log(JSON.stringify(response, null, 2));
    
    if (response.success) {
      console.log('\n✅ Browser tool executed successfully!');
    } else {
      console.log('\n❌ Browser tool failed');
    }
  } catch (e) {
    console.log(data.toString());
  }
  
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('error', function error(err) {
  console.error('\n❌ WebSocket error:', err.message);
  process.exit(1);
});

ws.on('close', function close() {
  console.log('\nWebSocket closed');
});

setTimeout(() => {
  console.log('\n⏱️  Timeout - no response received');
  ws.close();
  process.exit(1);
}, 15000);
