# BandWagon Location Privacy

BandWagon stores exact pickup/drop-off locations encrypted with `DATA_ENCRYPTION_KEY` and exposes only generalized location information before a ride is matched.

## Default behavior

- Exact address is encrypted at rest.
- Exact latitude/longitude are encrypted at rest when present.
- A generalized area and rounded coordinates may be shown before matching.
- Default reveal policy is `matched_driver`.
- Exact-address access attempts are recorded in `location_access_events`.
- A requester/location owner may always view their own location.
- A matched driver may view the exact address for locations using `matched_driver` policy.
- `ride_participants` may be used when requester, passenger, and driver all need exact access.
- `never` prevents exact-address reveal through the service layer.

## Generalization

The service rounds coordinates to two decimal places for the generalized map point, roughly neighborhood-scale rather than house-scale. `generalized_area` can contain a human-friendly description such as `Flower Mound - Central` or `Near FMHS`.

## Admin/API development flow

`POST /api/admin/location-privacy` requires a signed-in platform owner and supports:

- `action=create` to create an encrypted private location.
- `action=attach` to attach pickup/drop-off locations to a ride request.
- `action=view` to exercise authorization and reveal behavior.

Production user-facing ride screens should call the same service functions rather than decrypting database fields directly.

## Key management

`DATA_ENCRYPTION_KEY` must remain stable. Changing it without a key-rotation migration will make existing encrypted locations unreadable.
