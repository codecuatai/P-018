# Web Application Instructions

Call only the public API Gateway; never call an internal service or database, expose server credentials, or hand-edit generated clients. `localStorage` and optimistic UI are not authoritative for booking/payment, especially final or financial actions.

Do not log tokens, sensitive PII, payment data, or raw sensitive responses. Public flows need loading, empty, error, and retry states; confirmation UI must show the action, material data, and consequences. Do not claim a backend capability is ready while its documented status is `planned` or `skeleton`.
