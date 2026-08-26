import { getHistoryDetail, listHistory, login } from "../src/lib/api-client";

async function run() {
  await login("demo@x-one.ai", "password");
  const list = await listHistory({ service: "ride_booking" });
  if (list.items.length > 0) {
    console.log(JSON.stringify(list.items[0], null, 2));
    const detail = await getHistoryDetail("ride_booking", list.items[0].id);
    console.log(JSON.stringify(detail, null, 2));
  } else {
    console.log("no rides");
  }
}
run().catch(console.error);
