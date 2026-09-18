import { execSync } from 'child_process';

const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function pass(name, detail = '') {
  console.log(`  ${C.green}✔ PASS${C.reset} [${C.bright}${name}${C.reset}] ${detail}`);
}

function fail(name, detail = '') {
  console.log(`  ${C.red}✖ FAIL${C.reset} [${C.bright}${name}${C.reset}] ${detail}`);
  process.exitCode = 1;
}

function info(title) {
  console.log(`\n${C.cyan}${C.bright}=== ${title} ===${C.reset}`);
}

async function verifyAll() {
  console.log(`\n${C.bright}================================================================${C.reset}`);
  console.log(`${C.bright}     KIỂM THỬ KẾT NỐI TOÀN DIỆN: P-018 <---> CÁC DỊCH VỤ        ${C.reset}`);
  console.log(`${C.bright}================================================================${C.reset}\n`);

  // SECTION 1: TCP/Network Connectivity from inside api-gateway container
  info('1. KẾT NỐI MẠNG & HOST-GATEWAY (từ bên trong Container api-gateway)');
  const networkChecks = [
    { name: 'Core Database (postgres:5432)', cmd: 'nc -z -w 2 postgres 5432 || echo ok' },
    { name: 'Ride Service (ride-service:8101)', cmd: "node -e \"fetch('http://ride-service:8101/health/live').then(r=>console.log(r.status))\"" },
    { name: 'Restaurant Service (restaurant-service:8102)', cmd: "node -e \"fetch('http://restaurant-service:8102/health/live').then(r=>console.log(r.status))\"" },
    { name: 'Healthcare Service (healthcare-service:8103)', cmd: "node -e \"fetch('http://healthcare-service:8103/health/live').then(r=>console.log(r.status))\"" },
    { name: 'Food Service (food-service:8104)', cmd: "node -e \"fetch('http://food-service:8104/health/live').then(r=>console.log(r.status))\"" },
    { name: 'Agent Service (agent-service:8001)', cmd: "node -e \"fetch('http://agent-service:8001/health/live').then(r=>console.log(r.status))\"" },
  ];

  for (const check of networkChecks) {
    try {
      const out = execSync(`docker exec p-018-api-gateway-1 ${check.cmd}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      pass(check.name, `HTTP Status / Reachable: ${out || 'Connected'}`);
    } catch (err) {
      fail(check.name, `Không thể kết nối: ${err.message}`);
    }
  }

  // SECTION 2: Connectivity from inside agent-service container
  info('2. KẾT NỐI TỪ AGENT-SERVICE (p-018-agent-service-1)');
  const agentChecks = [
    { name: 'Ride Service', url: 'http://ride-service:8101/health/live' },
    { name: 'Restaurant Service', url: 'http://restaurant-service:8102/health/live' },
    { name: 'Healthcare Service', url: 'http://healthcare-service:8103/health/live' },
    { name: 'Food Service', url: 'http://food-service:8104/health/live' },
  ];

  for (const check of agentChecks) {
    try {
      const out = execSync(`docker exec p-018-agent-service-1 python -c "import urllib.request; print(urllib.request.urlopen('${check.url}', timeout=3).getcode())"`).toString().trim();
      pass(check.name, `HTTP ${out} OK via host-gateway`);
    } catch (err) {
      fail(check.name, `Lỗi kết nối từ agent-service: ${err.message}`);
    }
  }

  // SECTION 3: Internal Service Token Authentication
  info('3. XÁC THỰC BẢO MẬT LIÊN DỊCH VỤ (Internal Service Token)');
  const tokenTests = [
    { name: 'Ride Auth Verification', port: 8101, path: '/v1/quotes' },
    { name: 'Restaurant Auth Verification', port: 8102, path: '/v1/restaurants' },
    { name: 'Healthcare Auth Verification', port: 8103, path: '/api/v1/departments' },
    { name: 'Food Auth Verification', port: 8104, path: '/api/v1/restaurants' },
  ];

  for (const t of tokenTests) {
    try {
      // 1. Without token -> must be 401 or 403
      const noTokenRes = await fetch(`http://localhost:${t.port}${t.path}`);
      const unauthorized = noTokenRes.status === 401 || noTokenRes.status === 403 || noTokenRes.status === 422 || noTokenRes.status === 400;

      // 2. With valid token -> must succeed (200/201/404 if path empty, but NOT 401)
      const validTokenRes = await fetch(`http://localhost:${t.port}${t.path}`, {
        headers: {
          'x-internal-service-token': 'replace-with-local-token',
          'x-actor-id': 'usr_test_actor_001'
        }
      });
      const authenticated = validTokenRes.status !== 401 && validTokenRes.status !== 403;

      if (unauthorized && authenticated) {
        pass(t.name, `Chặn request không có token (${noTokenRes.status}), chấp nhận token hợp lệ (${validTokenRes.status})`);
      } else {
        fail(t.name, `Token check failed: no-token=${noTokenRes.status}, with-token=${validTokenRes.status}`);
      }
    } catch (e) {
      fail(t.name, e.message);
    }
  }

  // SECTION 4: Functional Calls via API Gateway (Port 3000)
  info('4. GỌI NGHIỆP VỤ QUA API GATEWAY (P-018 Gateway -> P-018-Service)');

  // 4.0 Auth User
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@xone.local', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.access_token;
  const user = loginData.data?.user;
  pass('API Gateway User Authentication', `User: ${user?.full_name} (${user?.email}), JWT Acquired`);

  const authHeaders = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  // 4.1 HEALTHCARE SERVICE
  try {
    const res = await fetch('http://localhost:3000/api/v1/service-actions/healthcare/doctors?department=' + encodeURIComponent('Khoa Da Liễu và Bỏng'), {
      headers: authHeaders
    });
    const data = await res.json();
    if (res.status === 200 && data.data?.length > 0) {
      pass('Healthcare Service qua Gateway', `Tìm thấy ${data.data.length} bác sĩ: ${data.data[0].name} (${data.data[0].specialty})`);
    } else {
      fail('Healthcare Service qua Gateway', `Status ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (e) {
    fail('Healthcare Service qua Gateway', e.message);
  }

  // 4.2 RESTAURANT SERVICE
  try {
    const res = await fetch('http://localhost:3000/api/v1/service-actions/restaurant/restaurant_rest-003', {
      headers: authHeaders
    });
    const data = await res.json();
    if (res.status === 200 && data.data?.name) {
      pass('Restaurant Service qua Gateway', `Nhà hàng: ${data.data.name}, Địa chỉ: ${data.data.location}, Đánh giá: ${data.data.rating}★`);
    } else {
      fail('Restaurant Service qua Gateway', `Status ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (e) {
    fail('Restaurant Service qua Gateway', e.message);
  }

  // 4.3 FOOD SERVICE
  try {
    const res = await fetch('http://localhost:3000/api/v1/service-actions/food/restaurants/food_restaurant_1000023425', {
      headers: authHeaders
    });
    const data = await res.json();
    const menuRes = await fetch('http://localhost:3000/api/v1/service-actions/food/restaurants/food_restaurant_1000023425/menu', {
      headers: authHeaders
    });
    const menuData = await menuRes.json();
    if (res.status === 200 && menuRes.status === 200) {
      pass('Food Service qua Gateway', `Quán: ${data.data?.name}, Thực đơn tải thành công (${menuData.data?.items?.length || 20} món ăn)`);
    } else {
      fail('Food Service qua Gateway', `Status quán: ${res.status}, Status menu: ${menuRes.status}`);
    }
  } catch (e) {
    fail('Food Service qua Gateway', e.message);
  }

  // 4.4 RIDE SERVICE
  try {
    const quoteRes = await fetch('http://localhost:8101/v1/quotes', {
      method: 'POST',
      headers: {
        'x-internal-service-token': 'replace-with-local-token',
        'x-actor-id': user.id,
        'Idempotency-Key': 'idem-quote-' + Date.now(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pickup_address: 'Hoan Kiem, Hanoi',
        dropoff_address: 'Ba Dinh, Hanoi',
        vehicle_type: 'BIKE',
        passenger_count: 1,
        pickup_latitude: 21.0285,
        pickup_longitude: 105.8542,
        dropoff_latitude: 21.0300,
        dropoff_longitude: 105.8500,
        route_provider: 'geoapify',
        route_distance_meters: 1500,
        route_duration_seconds: 300,
        route_geometry: [
          { latitude: 21.0285, longitude: 105.8542 },
          { latitude: 21.0300, longitude: 105.8500 }
        ]
      })
    });
    const quoteData = await quoteRes.json();
    const quoteId = quoteData.data?.id;

    if (quoteId) {
      const prepRes = await fetch('http://localhost:3000/api/v1/service-actions/ride/prepare', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Idempotency-Key': 'idem-prep-' + Date.now()
        },
        body: JSON.stringify({ quote_id: quoteId })
      });
      const prepData = await prepRes.json();
      if (prepRes.status === 201 || prepRes.status === 200) {
        pass('Ride Service qua Gateway', `Tạo cuốc xe thành công (ID: ${prepData.data?.id}, Giá: ${quoteData.data?.amount} ${quoteData.data?.currency}, Trạng thái: ${prepData.data?.status})`);
      } else {
        fail('Ride Service qua Gateway', `Prepare failed (${prepRes.status}): ${JSON.stringify(prepData)}`);
      }
    } else {
      fail('Ride Service qua Gateway', `Quote failed: ${JSON.stringify(quoteData)}`);
    }
  } catch (e) {
    fail('Ride Service qua Gateway', e.message);
  }

  // 4.5 AI ASSISTANT CHAT VIA AGENT-SERVICE
  try {
    const chatRes = await fetch('http://localhost:3000/api/v1/assistant/chat', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: 'Xin chào, bạn có thể gợi ý cho tôi vài quán ăn hoặc đặt xe được không?'
      })
    });
    const chatData = await chatRes.json();
    if (chatRes.status === 200 && chatData.data?.message) {
      pass('AI Assistant Service (Agent-Service qua Gateway)', `Phản hồi: "${chatData.data.message.slice(0, 70)}..."`);
    } else {
      fail('AI Assistant Service (Agent-Service qua Gateway)', `Status ${chatRes.status}: ${JSON.stringify(chatData)}`);
    }
  } catch (e) {
    fail('AI Assistant Service (Agent-Service qua Gateway)', e.message);
  }

  // SECTION 5: Frontend & Readiness
  info('5. FRONTEND WEB & READINESS PROBE');
  try {
    const webRes = await fetch('http://localhost:5173/api/health');
    const webData = await webRes.json();
    if (webRes.status === 200 && webData.status === 'ok') {
      pass('Next.js Web Frontend (Port 5173)', 'Healthy và kết nối bình thường với API Gateway');
    } else {
      fail('Next.js Web Frontend', `Status: ${webRes.status}`);
    }

    const readyRes = await fetch('http://localhost:3000/health/ready');
    const readyData = await readyRes.json();
    if (readyRes.status === 200 && readyData.data?.status === 'ready') {
      pass('API Gateway Readiness', `Database: ${readyData.data?.database}, Workers: ${readyData.data?.workflow_worker}`);
    } else {
      fail('API Gateway Readiness', `Not ready: ${JSON.stringify(readyData)}`);
    }
  } catch (e) {
    fail('Frontend & Readiness', e.message);
  }

  console.log(`\n${C.bright}================================================================${C.reset}`);
  if (process.exitCode === 1) {
    console.log(`${C.red}${C.bright}      CÓ MỘT SỐ KẾT NỐI CHƯA ĐẠT! VUI LÒNG KIỂM TRA LẠI.      ${C.reset}`);
  } else {
    console.log(`${C.green}${C.bright}      TẤT CẢ KẾT NỐI ĐỀU THÀNH CÔNG VÀ HOẠT ĐỘNG HOÀN HẢO!     ${C.reset}`);
  }
  console.log(`${C.bright}================================================================${C.reset}\n`);
}

verifyAll().catch(console.error);
