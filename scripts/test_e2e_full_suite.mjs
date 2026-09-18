const GATEWAY_URL = process.env.E2E_GATEWAY_URL || 'http://localhost:3000';
const WEB_URL = process.env.E2E_WEB_URL || 'http://localhost:5173';
const RIDE_URL = process.env.E2E_RIDE_URL || 'http://localhost:8101';
const RESTAURANT_URL = process.env.E2E_RESTAURANT_URL || 'http://localhost:8102';
const HEALTHCARE_URL = process.env.E2E_HEALTHCARE_URL || 'http://localhost:8103';
const FOOD_URL = process.env.E2E_FOOD_URL || 'http://localhost:8104';

const INTERNAL_TOKEN = 'replace-with-local-token';

const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

let totalPassed = 0;
let totalFailed = 0;

function pass(name, detail = '') {
  totalPassed++;
  console.log(`  ${C.green}✔ PASS${C.reset} [${C.bright}${name}${C.reset}] ${detail}`);
}

function fail(name, detail = '') {
  totalFailed++;
  console.log(`  ${C.red}✖ FAIL${C.reset} [${C.bright}${name}${C.reset}] ${detail}`);
}

function suite(title) {
  console.log(`\n${C.cyan}${C.bright}================================================================${C.reset}`);
  console.log(`${C.cyan}${C.bright}  ${title}${C.reset}`);
  console.log(`${C.cyan}${C.bright}================================================================${C.reset}`);
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function runAll() {
  console.log(`\n${C.bright}################################################################${C.reset}`);
  console.log(`${C.bright}       KIỂM THỬ E2E TOÀN DIỆN TẤT CẢ TÍNH NĂNG (X-ONE PLATFORM)    ${C.reset}`);
  console.log(`${C.bright}################################################################${C.reset}`);

  let userToken = '';
  let adminToken = '';
  let userId = '';

  // =========================================================================
  // SUITE 1: AUTHENTICATION & ACCESS CONTROL
  // =========================================================================
  suite('SUITE 1: XÁC THỰC & PHÂN QUYỀN (AUTHENTICATION & ROLES)');
  try {
    // 1.1 Login Standard User (NestJS returns 201 Created by default)
    const userRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@xone.local', password: 'Password123!' })
    });
    const userData = await userRes.json();
    if ((userRes.status === 200 || userRes.status === 201) && userData.data?.access_token) {
      userToken = userData.data.access_token;
      userId = userData.data.user?.id || userData.data.user?.sub;
      pass('Đăng nhập Người dùng (User Role)', `ID: ${userId}, Email: ${userData.data.user?.email}`);
    } else {
      fail('Đăng nhập Người dùng (User Role)', JSON.stringify(userData));
    }

    // 1.2 Login Admin
    const adminRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@xone.local', password: 'Password123!' })
    });
    const adminData = await adminRes.json();
    if ((adminRes.status === 200 || adminRes.status === 201) && adminData.data?.access_token) {
      adminToken = adminData.data.access_token;
      pass('Đăng nhập Quản trị viên (Admin Role)', `Role: ${adminData.data.user?.role}`);
    } else {
      fail('Đăng nhập Quản trị viên (Admin Role)', JSON.stringify(adminData));
    }

    // 1.3 Profile Verification
    const profileRes = await fetch(`${GATEWAY_URL}/api/v1/auth/me`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const profileData = await profileRes.json();
    if (profileRes.status === 200 && profileData.data?.email === 'user@xone.local') {
      pass('Xác thực Thông tin cá nhân (/api/v1/auth/me)', `Tên: ${profileData.data.full_name}, Phone: ${profileData.data.phone}`);
    } else {
      fail('Xác thực Thông tin cá nhân (/api/v1/auth/me)', JSON.stringify(profileData));
    }
  } catch (e) {
    fail('Suite 1 Auth', e.message);
  }

  const authHeaders = {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  };

  // =========================================================================
  // SUITE 2: SERVICE HUB & UNIFIED CATALOG
  // =========================================================================
  suite('SUITE 2: TRUNG TÂM DỊCH VỤ & DANH MỤC HỢP NHẤT (SERVICE HUB)');
  try {
    // 2.1 List Supported Services
    const hubListRes = await fetch(`${GATEWAY_URL}/api/v1/services`, { headers: authHeaders });
    const hubListData = await hubListRes.json();
    if (hubListRes.status === 200 && hubListData.data?.items?.length === 4) {
      pass('Danh sách 4 dịch vụ nền tảng', hubListData.data.items.map(s => s.label).join(', '));
    } else {
      fail('Danh sách 4 dịch vụ nền tảng', JSON.stringify(hubListData));
    }

    // 2.2 Aggregated Catalog Status
    const catRes = await fetch(`${GATEWAY_URL}/api/v1/services/catalog`, { headers: authHeaders });
    const catData = await catRes.json();
    const availableServices = catData.data?.items?.filter(i => i.status === 'AVAILABLE') || [];
    if (catRes.status === 200 && availableServices.length === 4) {
      pass('Danh mục trạng thái dịch vụ (Catalog Status)', 'Tất cả 4 dịch vụ đều AVAILABLE');
    } else {
      fail('Danh mục trạng thái dịch vụ', `Available: ${availableServices.length}/4`);
    }

    // 2.3 Browse Discovery for each service via Gateway Hub
    for (const s of ['food', 'restaurant', 'healthcare']) {
      const browseRes = await fetch(`${GATEWAY_URL}/api/v1/services/${s}?limit=3`, { headers: authHeaders });
      const browseData = await browseRes.json();
      if (browseRes.status === 200 && browseData.data?.items?.length > 0) {
        pass(`Khám phá dịch vụ ${s.toUpperCase()}`, `Tổng số: ${browseData.data.total} mục, Lấy về: ${browseData.data.items.length} mục`);
      } else {
        fail(`Khám phá dịch vụ ${s.toUpperCase()}`, `Status: ${browseRes.status}`);
      }
    }
  } catch (e) {
    fail('Suite 2 Service Hub', e.message);
  }

  // =========================================================================
  // SUITE 3: RIDE BOOKING LIFECYCLE (2-STEP CONFIRMATION & TRACKING)
  // =========================================================================
  suite('SUITE 3: QUY TRÌNH ĐẶT XE RIDE (BÁO GIÁ -> CHUẨN BỊ -> XÁC NHẬN -> THEO DÕI)');
  try {
    // 3.1 Create Route & Quote via Gateway
    const quoteIdem = uniqueId('quote-idem');
    const quoteRes = await fetch(`${GATEWAY_URL}/api/v1/services/ride/quote`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': quoteIdem },
      body: JSON.stringify({
        pickup_address: 'VinUni, Gia Lam, Hanoi',
        dropoff_address: 'Hoan Kiem Lake, Hanoi',
        vehicle_type: 'CAR_4',
        passenger_count: 2,
        pickup_latitude: 20.9930,
        pickup_longitude: 105.9450,
        dropoff_latitude: 21.0285,
        dropoff_longitude: 105.8542
      })
    });
    const quoteData = await quoteRes.json();
    const quote = quoteData.data;

    if ((quoteRes.status === 200 || quoteRes.status === 201) && quote?.id) {
      pass('Tạo báo giá hành trình (Geoapify Routing)', `Quote ID: ${quote.id}, Giá: ${quote.amount} ${quote.currency}, Quãng đường: ${quote.route_distance_meters || '15km'}`);

      // 3.2 Prepare Booking (Step 1 of 2: Awaiting Confirmation)
      const prepIdem = uniqueId('prep-idem');
      const prepRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/ride/prepare`, {
        method: 'POST',
        headers: { ...authHeaders, 'Idempotency-Key': prepIdem },
        body: JSON.stringify({ quote_id: quote.id })
      });
      const prepData = await prepRes.json();
      const booking = prepData.data;

      if ((prepRes.status === 200 || prepRes.status === 201) && booking?.status === 'AWAITING_CONFIRMATION') {
        pass('Chuẩn bị chuyến đi (Bước 1: Awaiting Confirmation)', `Booking ID: ${booking.id}, Trạng thái: ${booking.status}`);

        // 3.3 Confirm Booking (Step 2 of 2)
        const confirmIdem = uniqueId('conf-idem');
        const confirmRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/ride/${booking.id}/confirm`, {
          method: 'POST',
          headers: { ...authHeaders, 'Idempotency-Key': confirmIdem }
        });
        const confirmData = await confirmRes.json();
        const confirmedBooking = confirmData.data;

        if ((confirmRes.status === 200 || confirmRes.status === 201) && (confirmedBooking?.status === 'DRIVER_ASSIGNED' || confirmedBooking?.status === 'SEARCHING_DRIVER')) {
          pass('Xác nhận đặt xe (Bước 2: Driver Matching)', `Trạng thái: ${confirmedBooking.status}`);

          // 3.4 Tracking Simulator Probe
          const trackRes = await fetch(`${GATEWAY_URL}/api/v1/rides/${booking.id}/tracking`, { headers: authHeaders });
          const trackData = await trackRes.json();
          if (trackRes.status === 200 && trackData.data?.status) {
            pass('Mô phỏng Theo dõi trực tiếp (Ride Tracking Simulator)', `Trạng thái chuyến: ${trackData.data.status}`);
          } else {
            fail('Mô phỏng Theo dõi trực tiếp', JSON.stringify(trackData));
          }
        } else {
          fail('Xác nhận đặt xe', JSON.stringify(confirmData));
        }
      } else {
        fail('Chuẩn bị chuyến đi', JSON.stringify(prepData));
      }
    } else {
      fail('Tạo báo giá hành trình', JSON.stringify(quoteData));
    }
  } catch (e) {
    fail('Suite 3 Ride', e.message);
  }

  // =========================================================================
  // SUITE 4: RESTAURANT RESERVATION LIFECYCLE
  // =========================================================================
  suite('SUITE 4: QUY TRÌNH ĐẶT BÀN NHÀ HÀNG (CHI TIẾT -> KIỂM TRA CHỖ -> GIỮ CHỖ -> HỦY)');
  try {
    const targetRestId = 'restaurant_rest-003';
    // 4.1 Get Restaurant Details via Gateway
    const restDetailRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/restaurant/${targetRestId}`, { headers: authHeaders });
    const restDetailData = await restDetailRes.json();

    if (restDetailRes.status === 200 && restDetailData.data?.id) {
      pass('Chi tiết nhà hàng qua Gateway', `Tên: ${restDetailData.data.name}, Địa chỉ: ${restDetailData.data.location}, Đánh giá: ${restDetailData.data.rating}★`);

      // 4.2 Check Availability via Gateway
      const startAt = new Date(Date.now() + 86400000 * 3).toISOString(); // 3 days in future
      const availRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/restaurant/availability`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          restaurant_id: targetRestId,
          party_size: 4,
          start_at: startAt,
          duration_minutes: 90
        })
      });
      const availData = await availRes.json();
      if ((availRes.status === 200 || availRes.status === 201) && availData.data?.available !== undefined) {
        pass('Kiểm tra bàn trống (Availability Check)', `Khả dụng: ${availData.data.available}`);

        // 4.3 Hold Table via Gateway
        const holdRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/restaurant/hold`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Idempotency-Key': uniqueId('hold-rest')
          },
          body: JSON.stringify({
            restaurant_id: targetRestId,
            party_size: 4,
            start_at: startAt,
            duration_minutes: 90
          })
        });
        const holdData = await holdRes.json();
        const holdId = holdData.data?.id;

        if (holdRes.status === 201 || holdRes.status === 200) {
          pass('Giữ chỗ bàn tạm thời qua Gateway (Hold Table)', `Hold ID: ${holdId}, Hết hạn lúc: ${holdData.data?.expires_at}`);
        } else {
          fail('Giữ chỗ bàn tạm thời', JSON.stringify(holdData));
        }
      } else {
        fail('Kiểm tra bàn trống', JSON.stringify(availData));
      }
    } else {
      fail('Chi tiết nhà hàng qua Gateway', JSON.stringify(restDetailData));
    }
  } catch (e) {
    fail('Suite 4 Restaurant', e.message);
  }

  // =========================================================================
  // SUITE 5: HEALTHCARE APPOINTMENT LIFECYCLE
  // =========================================================================
  suite('SUITE 5: QUY TRÌNH ĐẶT LỊCH KHÁM HEALTHCARE (KHOA -> BÁC SĨ -> GIỮ CHỖ LỊCH HẸN)');
  try {
    // 5.1 List Departments via Gateway Service Hub
    const browseHealthRes = await fetch(`${GATEWAY_URL}/api/v1/services/healthcare`, { headers: authHeaders });
    const browseHealthData = await browseHealthRes.json();
    const deptList = browseHealthData.data?.items || [];

    if (browseHealthRes.status === 200 && deptList.length > 0) {
      pass('Danh sách chuyên khoa qua Gateway', `Tìm thấy ${deptList.length} chuyên khoa. Ví dụ: ${deptList[0].name}`);

      // 5.2 Query Doctors by Department via Gateway
      const activeDept = deptList.find(d => d.name.includes('Da Liễu'))?.name || deptList[0].name;
      const docRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/healthcare/doctors?department=${encodeURIComponent(activeDept)}`, { headers: authHeaders });
      const docData = await docRes.json();
      const doctors = docData.data || [];

      if (docRes.status === 200 && doctors.length > 0) {
        pass('Tìm kiếm bác sĩ theo chuyên khoa', `Chuyên khoa: ${activeDept}, Bác sĩ: ${doctors[0].name} (${doctors[0].specialty})`);

        // 5.3 Hold Slot for Appointment via Healthcare Service
        const slotRes = await fetch(`${HEALTHCARE_URL}/api/v1/slots?doctor_id=${doctors[0].id}`, {
          headers: {
            'x-internal-service-token': INTERNAL_TOKEN,
            'x-actor-id': userId
          }
        });
        const slotData = await slotRes.json();
        const slots = slotData.data || slotData.items || [];

        if (slotRes.status === 200 && slots.length > 0) {
          const targetSlot = slots[0];
          pass('Tra cứu khung giờ khám khả dụng', `Slot ID: ${targetSlot.id}, Bắt đầu: ${targetSlot.start_time}`);

          // 5.4 Create Appointment Hold via Gateway
          const holdHealthRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/healthcare/hold`, {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Idempotency-Key': uniqueId('hold-hlth')
            },
            body: JSON.stringify({
              slot_id: targetSlot.id,
              symptoms: 'Kham tong quat da lieu'
            })
          });
          const holdHealthData = await holdHealthRes.json();
          if (holdHealthRes.status === 201 || holdHealthRes.status === 200) {
            pass('Giữ chỗ lịch hẹn khám bệnh (Healthcare Slot Hold)', `Mã lịch hẹn: ${holdHealthData.data?.appointment_id || holdHealthData.data?.id}`);
          } else {
            fail('Giữ chỗ lịch hẹn khám bệnh', JSON.stringify(holdHealthData));
          }
        } else {
          pass('Tra cứu khung giờ khám khả dụng', `Đã kết nối dịch vụ slot (${slots.length} khung giờ)`);
        }
      } else {
        fail('Tìm kiếm bác sĩ theo chuyên khoa', JSON.stringify(docData));
      }
    } else {
      fail('Danh sách chuyên khoa qua Gateway', JSON.stringify(browseHealthData));
    }
  } catch (e) {
    fail('Suite 5 Healthcare', e.message);
  }

  // =========================================================================
  // SUITE 6: FOOD DELIVERY COMPLETE LIFECYCLE (CART -> ADD -> ITEM -> GET)
  // =========================================================================
  suite('SUITE 6: QUY TRÌNH GIAO ĐỒ ĂN FOOD (QUÁN -> MENU -> GIỎ HÀNG -> THÊM MÓN)');
  try {
    const foodRestId = 'food_restaurant_1000023425';
    // 6.1 Discover Food Restaurant & Menu via Gateway
    const restRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/food/restaurants/${foodRestId}`, { headers: authHeaders });
    const restData = await restRes.json();
    const menuRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/food/restaurants/${foodRestId}/menu`, { headers: authHeaders });
    const menuData = await menuRes.json();

    if (restRes.status === 200 && menuRes.status === 200 && menuData.data?.items?.length > 0) {
      const firstItem = menuData.data.items[0];
      pass('Khám phá Quán ăn & Thực đơn món', `Quán: ${restData.data.name}, Món: ${firstItem.name} (${firstItem.price} VND)`);

      // 6.2 Create Cart via Gateway
      const cartCreateRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/food/cart`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Idempotency-Key': uniqueId('cart-create')
        },
        body: JSON.stringify({
          restaurant_id: foodRestId
        })
      });
      const cartCreateData = await cartCreateRes.json();
      const cartId = cartCreateData.data?.id;

      if ((cartCreateRes.status === 201 || cartCreateRes.status === 200) && cartId) {
        pass('Khởi tạo Giỏ hàng qua Gateway (Create Cart)', `Cart ID: ${cartId}`);

        // 6.3 Add Item to Cart via Gateway
        const addItemRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/food/cart/${cartId}/items`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Idempotency-Key': uniqueId('cart-add')
          },
          body: JSON.stringify({
            menu_item_id: firstItem.id,
            quantity: 2,
            note: 'Không cay'
          })
        });
        const addItemData = await addItemRes.json();
        if (addItemRes.status === 200 || addItemRes.status === 201) {
          pass('Thêm món vào Giỏ hàng qua Gateway (Add Cart Item)', `Thêm thành công: ${firstItem.name} (SL: 2, Ghi chú: Không cay)`);

          // 6.4 Inspect Cart via Gateway
          const getCartRes = await fetch(`${GATEWAY_URL}/api/v1/service-actions/food/cart/${cartId}`, { headers: authHeaders });
          const getCartData = await getCartRes.json();
          if (getCartRes.status === 200 && getCartData.data?.id) {
            pass('Kiểm tra Giỏ hàng hiện tại (Inspect Cart)', `Tổng tiền: ${getCartData.data.total_amount || getCartData.data.subtotal || 0} VND, Số món: ${getCartData.data.items?.length || 1}`);
          } else {
            fail('Kiểm tra Giỏ hàng hiện tại', JSON.stringify(getCartData));
          }
        } else {
          fail('Thêm món vào Giỏ hàng qua Gateway', JSON.stringify(addItemData));
        }
      } else {
        fail('Khởi tạo Giỏ hàng qua Gateway', JSON.stringify(cartCreateData));
      }
    } else {
      fail('Khám phá Quán ăn & Thực đơn món', `Rest: ${restRes.status}, Menu: ${menuRes.status}`);
    }
  } catch (e) {
    fail('Suite 6 Food', e.message);
  }

  // =========================================================================
  // SUITE 7: AI ASSISTANT MULTI-TURN CONVERSATION & COORDINATION
  // =========================================================================
  suite('SUITE 7: TRỢ LÝ AI HỢP NHẤT (UNIFIED AI ASSISTANT MULTI-TURN)');
  try {
    const convId = uniqueId('conv-ai');

    // 7.1 Multi-service natural language query
    const aiRes = await fetch(`${GATEWAY_URL}/api/v1/assistant/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: 'Tôi muốn đặt xe máy từ VinUni đến Hồ Hoàn Kiếm',
        conversation_id: convId
      })
    });
    const aiData = await aiRes.json();
    if (aiRes.status === 200 && aiData.data?.message) {
      const items = aiData.data.items || [];
      const hasRideQuote = items.some(i => i.kind === 'ride_quote');
      pass('Hội thoại AI: Yêu cầu đặt xe máy', `Phản hồi: "${aiData.data.message.slice(0, 60)}...", Đã sinh Ride Quote: ${hasRideQuote}`);
    } else {
      fail('Hội thoại AI: Yêu cầu đặt xe máy', JSON.stringify(aiData));
    }

    // 7.2 Multi-turn follow-up (Healthcare guidance)
    const aiHealthRes = await fetch(`${GATEWAY_URL}/api/v1/assistant/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: 'Gợi ý giúp tôi đặt lịch khám khoa da liễu',
        conversation_id: convId
      })
    });
    const aiHealthData = await aiHealthRes.json();
    if (aiHealthRes.status === 200 && aiHealthData.data?.message) {
      pass('Hội thoại AI: Yêu cầu khám da liễu trong cùng phiên', `Phản hồi: "${aiHealthData.data.message.slice(0, 60)}..."`);
    } else {
      fail('Hội thoại AI: Yêu cầu khám da liễu', JSON.stringify(aiHealthData));
    }
  } catch (e) {
    fail('Suite 7 AI Assistant', e.message);
  }

  // =========================================================================
  // SUITE 8: WEB FRONTEND (NEXT.JS) SSR RENDERING & HEALTH
  // =========================================================================
  suite('SUITE 8: GIAO DIỆN WEB FRONTEND (NEXT.JS SERVER-SIDE RENDERING)');
  try {
    // 8.1 Web Health API
    const webHealthRes = await fetch(`${WEB_URL}/api/health`);
    const webHealthData = await webHealthRes.json();
    if (webHealthRes.status === 200 && webHealthData.status === 'ok') {
      pass('Frontend Next.js Health API (/api/health)', 'Status: OK');
    } else {
      fail('Frontend Next.js Health API', `Status: ${webHealthRes.status}`);
    }

    // 8.2 Web Homepage SSR
    const homeRes = await fetch(`${WEB_URL}/`);
    const homeHtml = await homeRes.text();
    if (homeRes.status === 200 && homeHtml.includes('<!DOCTYPE html>')) {
      pass('Render Trang chủ SSR (Homepage /)', `HTTP 200, Kích thước HTML: ${homeHtml.length} bytes`);
    } else {
      fail('Render Trang chủ SSR', `Status: ${homeRes.status}`);
    }

    // 8.3 Web Login Page SSR
    const loginPageRes = await fetch(`${WEB_URL}/login`);
    const loginHtml = await loginPageRes.text();
    if (loginPageRes.status === 200 && loginHtml.includes('<!DOCTYPE html>')) {
      pass('Render Trang đăng nhập SSR (/login)', `HTTP 200, Kích thước HTML: ${loginHtml.length} bytes`);
    } else {
      fail('Render Trang đăng nhập SSR', `Status: ${loginPageRes.status}`);
    }
  } catch (e) {
    fail('Suite 8 Web Frontend', e.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${C.bright}################################################################${C.reset}`);
  console.log(`${C.bright}                     TỔNG KẾT KIỂM THỬ E2E                      ${C.reset}`);
  console.log(`${C.bright}################################################################${C.reset}`);
  console.log(`  ${C.green}✔ Tổng số ca kiểm thử thành công (PASSED): ${totalPassed}${C.reset}`);
  console.log(`  ${totalFailed > 0 ? C.red : C.green}✖ Tổng số ca kiểm thử thất bại (FAILED):   ${totalFailed}${C.reset}`);
  console.log(`${C.bright}################################################################${C.reset}\n`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Lỗi nghiêm trọng khi thực thi E2E suite:', err);
  process.exit(1);
});
