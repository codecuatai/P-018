INSERT INTO food_catalog (id, record_type, data) VALUES
('res_pho_hanoi', 'restaurant', '{"id":"res_pho_hanoi","name":"Phở Gánh Phố Cổ","category":"Phở","district":"Hoàn Kiếm","address":"12 Hàng Trống, Hoàn Kiếm, Hà Nội","latitude":21.0285,"longitude":105.852,"is_open":true}'),
('res_bun_cha', 'restaurant', '{"id":"res_bun_cha","name":"Bún Chả Góc Phố","category":"Bún chả","district":"Ba Đình","address":"34 Ngọc Hà, Ba Đình, Hà Nội","latitude":21.0375,"longitude":105.829,"is_open":true}'),
('res_com_viet', 'restaurant', '{"id":"res_com_viet","name":"Cơm Nhà Hà Nội","category":"Cơm","district":"Đống Đa","address":"88 Chùa Láng, Đống Đa, Hà Nội","latitude":21.0185,"longitude":105.807,"is_open":true}')
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();

INSERT INTO food_catalog (id, record_type, data) VALUES
('item_pho_bo', 'menu_item', '{"id":"item_pho_bo","restaurant_id":"res_pho_hanoi","name":"Phở bò tái","description":"Phở bò nước dùng trong, thịt bò tái mềm.","category":"Phở","price":65000,"currency":"VND","available":true,"option_groups":[{"id":"opt_spice","name":"Mức cay","required":false,"options":[{"id":"mild","name":"Không cay","price":0},{"id":"hot","name":"Cay vừa","price":0}]},{"id":"opt_size","name":"Kích thước","required":true,"options":[{"id":"regular","name":"Thường","price":0},{"id":"large","name":"Lớn","price":15000}]}]}'),
('item_pho_ga', 'menu_item', '{"id":"item_pho_ga","restaurant_id":"res_pho_hanoi","name":"Phở gà","description":"Phở gà ta thơm nhẹ.","category":"Phở","price":60000,"currency":"VND","available":true,"option_groups":[]}'),
('item_bun_cha', 'menu_item', '{"id":"item_bun_cha","restaurant_id":"res_bun_cha","name":"Bún chả Hà Nội","description":"Bún chả nướng than, nước chấm truyền thống.","category":"Bún chả","price":70000,"currency":"VND","available":true,"option_groups":[{"id":"opt_extra","name":"Thêm món","required":false,"options":[{"id":"nem","name":"Nem cua bể","price":20000}]}]}'),
('item_com_ga', 'menu_item', '{"id":"item_com_ga","restaurant_id":"res_com_viet","name":"Cơm gà nướng","description":"Cơm gạo dẻo với gà nướng mật ong.","category":"Cơm","price":75000,"currency":"VND","available":true,"option_groups":[]}')
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();

INSERT INTO food_catalog (id, record_type, data) VALUES
('XONE50', 'voucher', '{"code":"XONE50","discount_type":"percentage","discount_value":10,"maximum_discount":50000,"minimum_order_amount":100000,"expires_at":"2030-12-31T23:59:59+00:00","usage_limit":1000,"used_count":0,"restaurant_id":null}'),
('PHO20K', 'voucher', '{"code":"PHO20K","discount_type":"fixed","discount_value":20000,"maximum_discount":null,"minimum_order_amount":60000,"expires_at":"2030-12-31T23:59:59+00:00","usage_limit":1000,"used_count":0,"restaurant_id":"res_pho_hanoi"}'),
('addr_demo', 'address', '{"id":"addr_demo","user_id":"usr_demo_001","label":"Nhà riêng","address":"25 Lê Đại Hành, Hai Bà Trưng, Hà Nội","district":"Hai Bà Trưng","latitude":21.0125,"longitude":105.848}')
ON CONFLICT (id) DO UPDATE SET data = CASE WHEN EXCLUDED.record_type = 'voucher' THEN jsonb_set(EXCLUDED.data, '{used_count}', to_jsonb(COALESCE((food_catalog.data->>'used_count')::int, 0)), true) ELSE EXCLUDED.data END, updated_at = now();

INSERT INTO food_drivers (id, data, available) VALUES
('drv_001', '{"id":"drv_001","name":"Nguyễn Văn Minh","phone":"090***1234","vehicle_type":"Xe máy","license_plate":"29A-123.45"}', true)
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, available = food_drivers.available, updated_at = now();
