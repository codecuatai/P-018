# Mobile Application Instructions

Call only the public API Gateway; never call an internal service or database, expose server credentials, or treat offline/local state as final booking/payment state. Validate deep links and do not retry a final write on resume without its idempotency key and a confirmed backend result.

Do not store tokens in insecure storage or log notification payloads, sensitive PII, payment data, or raw sensitive responses. Confirmation UI must show the action, material data, and consequences; keep sensitive screens/data only as long as needed. Do not claim a backend capability is ready while its documented status is `planned` or `skeleton`.
