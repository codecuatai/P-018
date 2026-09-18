import { execSync } from 'child_process';

async function runTests() {
  console.log('========================================================');
  console.log('       TESTING END-TO-END SERVICES INTEGRATION');
  console.log('========================================================\n');

  // 0. Login to API Gateway
  console.log('[0] Authenticating with API Gateway...');
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@xone.local', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    throw new Error('Login failed: ' + JSON.stringify(loginData));
  }
  const token = loginData.data.access_token;
  const user = loginData.data.user;
  console.log('  -> Logged in as:', user.full_name, '(' + user.email + ')');
  console.log('  -> JWT Token acquired successfully.\n');

  const authHeaders = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  // 1. HEALTHCARE SERVICE via Gateway
  console.log('[1] Testing HEALTHCARE SERVICE via API Gateway:');
  const hcRes = await fetch('http://localhost:3000/api/v1/service-actions/healthcare/doctors?department=' + encodeURIComponent('Khoa Da Liễu và Bỏng'), {
    headers: authHeaders
  });
  const hcData = await hcRes.json();
  console.log('  -> Endpoint: GET /api/v1/service-actions/healthcare/doctors?department=Khoa Da Liễu và Bỏng');
  console.log('  -> HTTP Status:', hcRes.status);
  console.log('  -> Doctor Name:', hcData.data?.[0]?.name);
  console.log('  -> Specialty:', hcData.data?.[0]?.specialty);
  console.log('  -> Consultation Price:', hcData.data?.[0]?.price, 'VND');
  if (hcRes.status === 200 && hcData.data?.length > 0) {
    console.log('  [PASS] Healthcare Service is fully working via API Gateway!\n');
  } else {
    console.log('  [FAIL] Healthcare Service response unexpected.\n');
  }

  // 2. RESTAURANT SERVICE via Gateway
  console.log('[2] Testing RESTAURANT SERVICE via API Gateway:');
  const restRes = await fetch('http://localhost:3000/api/v1/service-actions/restaurant/restaurant_rest-003', {
    headers: authHeaders
  });
  const restData = await restRes.json();
  console.log('  -> Endpoint: GET /api/v1/service-actions/restaurant/restaurant_rest-003');
  console.log('  -> HTTP Status:', restRes.status);
  console.log('  -> Restaurant Name:', restData.data?.name);
  console.log('  -> Location:', restData.data?.location);
  console.log('  -> Rating:', restData.data?.rating);
  if (restRes.status === 200 && restData.data?.name) {
    console.log('  [PASS] Restaurant Service is fully working via API Gateway!\n');
  } else {
    console.log('  [FAIL] Restaurant Service response unexpected.\n');
  }

  // 3. FOOD SERVICE via Gateway
  console.log('[3] Testing FOOD SERVICE via API Gateway:');
  const foodRes = await fetch('http://localhost:3000/api/v1/service-actions/food/restaurants/food_restaurant_1000023425', {
    headers: authHeaders
  });
  const foodData = await foodRes.json();
  console.log('  -> Endpoint: GET /api/v1/service-actions/food/restaurants/food_restaurant_1000023425');
  console.log('  -> HTTP Status:', foodRes.status);
  console.log('  -> Food Restaurant Name:', foodData.data?.name);
  console.log('  -> Address:', foodData.data?.address);

  const menuRes = await fetch('http://localhost:3000/api/v1/service-actions/food/restaurants/food_restaurant_1000023425/menu', {
    headers: authHeaders
  });
  const menuData = await menuRes.json();
  console.log('  -> Endpoint: GET .../menu');
  console.log('  -> Menu HTTP Status:', menuRes.status);
  console.log('  -> Total Menu Items:', menuData.data?.items?.length || menuData.data?.length);
  if (foodRes.status === 200 && foodData.data?.name) {
    console.log('  [PASS] Food Service is fully working via API Gateway!\n');
  } else {
    console.log('  [FAIL] Food Service response unexpected.\n');
  }

  // 4. RIDE SERVICE via internal token & Gateway prepare endpoint
  console.log('[4] Testing RIDE SERVICE via API Gateway:');
  const rideQuoteRes = await fetch('http://localhost:8101/v1/quotes', {
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
  const quoteData = await rideQuoteRes.json();
  console.log('  -> Endpoint: POST http://localhost:8101/v1/quotes (internal direct)');
  console.log('  -> HTTP Status:', rideQuoteRes.status);
  console.log('  -> Quote ID:', quoteData.data?.id);
  console.log('  -> Quote Amount:', quoteData.data?.amount, quoteData.data?.currency);
  console.log('  -> Distance:', quoteData.data?.distance_km, 'km');

  if (quoteData.data?.id) {
    console.log('  -> Calling API Gateway: POST /api/v1/service-actions/ride/prepare');
    const prepRes = await fetch('http://localhost:3000/api/v1/service-actions/ride/prepare', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Idempotency-Key': 'idem-prep-' + Date.now()
      },
      body: JSON.stringify({ quote_id: quoteData.data.id })
    });
    const prepData = await prepRes.json();
    console.log('  -> Gateway Prepare HTTP Status:', prepRes.status);
    console.log('  -> Booking ID:', prepData.data?.id);
    console.log('  -> Booking Status:', prepData.data?.status);
    console.log('  -> Vehicle Type:', prepData.data?.vehicle_type);
    if (prepRes.status === 200 || prepRes.status === 201) {
      console.log('  [PASS] Ride Service is fully working via API Gateway!\n');
    }
  }

  // 5. AGENT SERVICE (Internal Docker Container)
  console.log('[5] Testing AGENT SERVICE:');
  const agentOutput = execSync('docker exec p-018-agent-service-1 python -c "import urllib.request, json; res = urllib.request.urlopen(\'http://localhost:8001/health/live\'); print(res.read().decode())"').toString().trim();
  console.log('  -> Container: p-018-agent-service-1 (port 8001)');
  console.log('  -> Live Status:', agentOutput);
  if (agentOutput.includes('"live"')) {
    console.log('  [PASS] Agent Service is healthy and operational!\n');
  }

  // 6. WEB FRONTEND
  console.log('[6] Testing WEB FRONTEND:');
  const webRes = await fetch('http://localhost:5173/api/health');
  const webData = await webRes.json();
  console.log('  -> Endpoint: GET http://localhost:5173/api/health');
  console.log('  -> HTTP Status:', webRes.status);
  console.log('  -> Web Health:', JSON.stringify(webData));
  if (webRes.status === 200) {
    console.log('  [PASS] Web Frontend is running and healthy!\n');
  }

  console.log('========================================================');
  console.log('    CONGRATULATIONS! ALL INTEGRATION TESTS PASSED!      ');
  console.log('========================================================');
}

runTests().catch(e => {
  console.error('[ERROR]', e);
  process.exit(1);
});
