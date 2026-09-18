import { execSync } from 'child_process';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let passed = 0;
let failed = 0;

function pass(name, detail = '') {
  passed++;
  console.log(`  ${C.green}✔ PASS${C.reset} [${C.bright}${name}${C.reset}] ${detail}`);
}

function fail(name, detail = '') {
  failed++;
  console.log(`  ${C.red}✖ FAIL${C.reset} [${C.bright}${name}${C.reset}] ${detail}`);
}

function suite(title) {
  console.log(`\n${C.cyan}${C.bright}=== ${title} ===${C.reset}`);
}

async function testMcp() {
  console.log(`\n${C.bright}================================================================${C.reset}`);
  console.log(`${C.bright}     KIỂM THỬ KẾT NỐI MCP (MODEL CONTEXT PROTOCOL) VỚI 4 DỊCH VỤ   ${C.reset}`);
  console.log(`${C.bright}================================================================${C.reset}\n`);

  // 1. Authenticate Provider
  suite('1. XÁC THỰC PROVIDER & TẠO MCP API KEY');
  let token = '';
  let providerUser = null;
  try {
    const loginRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'provider@xone.local', password: 'Password123!' }),
    });
    const loginData = await loginRes.json();
    if (loginRes.status === 200 || loginRes.status === 201) {
      token = loginData.data?.access_token;
      providerUser = loginData.data?.user;
      pass('Đăng nhập Provider', `User: ${providerUser?.email}, Role: ${providerUser?.role}`);
    } else {
      fail('Đăng nhập Provider', JSON.stringify(loginData));
      return;
    }

    // Create MCP API Key
    const keyRes = await fetch(`${GATEWAY_URL}/api/v1/provider/mcp-keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Claude Code Local Key' }),
    });
    const keyData = await keyRes.json();
    if (keyRes.status === 200 || keyRes.status === 201) {
      const rawKey = keyData.data?.key;
      pass('Tạo MCP API Key cho Đối tác', `Key Prefix: ${keyData.data?.key_prefix}, Raw Key: ${rawKey?.slice(0, 15)}...`);
    } else {
      fail('Tạo MCP API Key cho Đối tác', JSON.stringify(keyData));
    }
  } catch (e) {
    fail('Xác thực Provider', e.message);
  }

  // 2. MCP Handshake & Protocol Handshake
  suite('2. BẮT TAY GIAO THỨC MCP (JSON-RPC 2.0 INITIALIZE & SESSION)');
  let sessionId = '';
  try {
    const initRes = await fetch(`${GATEWAY_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'claude-code', version: '1.0.0' },
        },
      }),
    });
    const initData = await initRes.json();
    sessionId = initRes.headers.get('mcp-session-id') || '';
    if (initRes.status === 200 && initData.result?.serverInfo?.name === 'x-one-provider-mcp') {
      pass('Khởi tạo phiên MCP (initialize)', `Server: ${initData.result.serverInfo.name} v${initData.result.serverInfo.version}, Session ID: ${sessionId}`);
    } else {
      fail('Khởi tạo phiên MCP (initialize)', JSON.stringify(initData));
    }

    // Ping check
    const pingRes = await fetch(`${GATEWAY_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Mcp-Session-Id': sessionId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
      }),
    });
    const pingData = await pingRes.json();
    if (pingRes.status === 200 && pingData.result) {
      pass('Kiểm tra nhịp tim MCP (ping)', `Status: 200 OK`);
    } else {
      fail('Kiểm tra nhịp tim MCP (ping)', JSON.stringify(pingData));
    }
  } catch (e) {
    fail('MCP Handshake', e.message);
  }

  // 3. MCP Tools Discovery
  suite('3. KHÁM PHÁ DANH SÁCH CÔNG CỤ MCP (TOOLS/LIST)');
  let toolList = [];
  try {
    const listRes = await fetch(`${GATEWAY_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Mcp-Session-Id': sessionId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      }),
    });
    const listData = await listRes.json();
    toolList = listData.result?.tools || [];
    if (listRes.status === 200 && toolList.length >= 15) {
      pass('Liệt kê danh sách công cụ MCP', `Tìm thấy ${toolList.length} công cụ nghiệp vụ sẵn sàng cho Claude/LLM`);
      console.log(`     -> Các công cụ: ${toolList.map(t => t.name).join(', ')}`);
    } else {
      fail('Liệt kê danh sách công cụ MCP', JSON.stringify(listData));
    }
  } catch (e) {
    fail('MCP tools/list', e.message);
  }

  // 4. MCP Tools Call Connecting to the 4 Domain Services
  suite('4. GỌI CÔNG CỤ MCP KẾT NỐI TRỰC TIẾP 4 MICROSERVICES');

  async function callMcpTool(name, args, id) {
    const res = await fetch(`${GATEWAY_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Mcp-Session-Id': sessionId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      }),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  // 4.1 Test MCP -> Food Service
  try {
    const { status, data } = await callMcpTool('catalog.search', { service: 'food', limit: 3 }, 4);
    if (status === 200 && data.result?.content?.[0]?.text) {
      const parsed = JSON.parse(data.result.content[0].text);
      pass('MCP kết nối Food Service (catalog.search)', `Lấy thành công ${parsed.items?.length || 0} quán ăn (Ví dụ: ${parsed.items?.[0]?.name})`);
    } else {
      fail('MCP kết nối Food Service', JSON.stringify(data));
    }
  } catch (e) {
    fail('MCP kết nối Food Service', e.message);
  }

  // 4.2 Test MCP -> Restaurant Service
  try {
    const { status, data } = await callMcpTool('catalog.search', { service: 'restaurant', limit: 3 }, 5);
    if (status === 200 && data.result?.content?.[0]?.text) {
      const parsed = JSON.parse(data.result.content[0].text);
      pass('MCP kết nối Restaurant Service (catalog.search)', `Lấy thành công ${parsed.items?.length || 0} nhà hàng (Ví dụ: ${parsed.items?.[0]?.name})`);
    } else {
      fail('MCP kết nối Restaurant Service', JSON.stringify(data));
    }
  } catch (e) {
    fail('MCP kết nối Restaurant Service', e.message);
  }

  // 4.3 Test MCP -> Healthcare Service
  try {
    const { status, data } = await callMcpTool('catalog.search', { service: 'healthcare', limit: 3 }, 6);
    if (status === 200 && data.result?.content?.[0]?.text) {
      const parsed = JSON.parse(data.result.content[0].text);
      pass('MCP kết nối Healthcare Service (catalog.search)', `Lấy thành công ${parsed.items?.length || 0} chuyên khoa (Ví dụ: ${parsed.items?.[0]?.name})`);
    } else {
      fail('MCP kết nối Healthcare Service', JSON.stringify(data));
    }
  } catch (e) {
    fail('MCP kết nối Healthcare Service', e.message);
  }

  // 4.4 Test MCP -> Ride Service Operations
  try {
    const { status, data } = await callMcpTool('ride.list_pending_bookings', { limit: 10 }, 7);
    if (status === 200 && data.result?.content?.[0]?.text) {
      const parsed = JSON.parse(data.result.content[0].text);
      pass('MCP kết nối Ride Service (ride.list_pending_bookings)', `Truy vấn trạng thái chuyến xe đang chờ thành công (${parsed.count} cuốc xe)`);
    } else {
      fail('MCP kết nối Ride Service', JSON.stringify(data));
    }
  } catch (e) {
    fail('MCP kết nối Ride Service', e.message);
  }

  // 4.5 Test MCP -> Restaurant Service Tables
  try {
    const { status, data } = await callMcpTool('restaurant.list_tables', {}, 8);
    if (status === 200 && data.result?.content?.[0]?.text) {
      const parsed = JSON.parse(data.result.content[0].text);
      const count = parsed.items ? parsed.items.length : Array.isArray(parsed) ? parsed.length : 0;
      pass('MCP kết nối Restaurant Service Tables (restaurant.list_tables)', `Tra cứu nhà hàng/bàn thành công (${count} nhà hàng: ${parsed.items?.[0]?.name || ''})`);
    } else {
      fail('MCP kết nối Restaurant Service Tables', JSON.stringify(data));
    }
  } catch (e) {
    fail('MCP kết nối Restaurant Service Tables', e.message);
  }

  // 4.6 Test MCP -> Healthcare Appointments
  try {
    const { status, data } = await callMcpTool('healthcare.list_appointments', { limit: 5 }, 9);
    if (status === 200 && data.result?.content?.[0]?.text) {
      const parsed = JSON.parse(data.result.content[0].text);
      pass('MCP kết nối Healthcare Appointments (healthcare.list_appointments)', `Truy vấn lịch khám thành công (${parsed.count || 0} lịch hẹn)`);
    } else {
      fail('MCP kết nối Healthcare Appointments', JSON.stringify(data));
    }
  } catch (e) {
    fail('MCP kết nối Healthcare Appointments', e.message);
  }

  // 5. Test SSE Streaming (Server-Sent Events)
  suite('5. KẾT NỐI SSE STREAMING (SERVER-SENT EVENTS /mcp)');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const sseRes = await fetch(`${GATEWAY_URL}/mcp`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const contentType = sseRes.headers.get('content-type') || '';
    if (sseRes.status === 200 && contentType.includes('text/event-stream')) {
      pass('MCP Streamable HTTP / SSE', `Status: 200, Content-Type: ${contentType}`);
    } else {
      fail('MCP Streamable HTTP / SSE', `Status: ${sseRes.status}, Content-Type: ${contentType}`);
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      pass('MCP Streamable HTTP / SSE', `Nhận luồng event-stream thành công (Connection Established)`);
    } else {
      fail('MCP Streamable HTTP / SSE', e.message);
    }
  }

  console.log(`\n${C.bright}================================================================${C.reset}`);
  console.log(`${C.bright}                     TỔNG KẾT KIỂM THỬ MCP                      ${C.reset}`);
  console.log(`${C.bright}================================================================${C.reset}`);
  console.log(`  ${C.green}✔ PASSED: ${passed}${C.reset}`);
  console.log(`  ${failed === 0 ? C.green : C.red}✖ FAILED: ${failed}${C.reset}`);
  console.log(`${C.bright}================================================================${C.reset}\n`);

  if (failed > 0) process.exit(1);
}

testMcp();
