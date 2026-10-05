# Product and play archives — October 5, 2026

Owners with administrator accounts and authorized staff can archive and restore store products. Coaches can archive and restore plays for their own teams; staff/admin retain their existing team access. Families cannot use these management actions.

## Where to find the controls

- Web products: Operations → Manage your community → Products → Archive product / Restore product.
- Web plays: Training hub → Coaching studio → Playbook → Archive play. Select Show archived plays to restore.
- Native products: More → Reports → Inventory → select the product → Archive product / Restore product.
- Native plays: Training → Mobile playbook → Archive play. Show archived plays exposes Restore play.

Archiving is reversible and retains the record. Archived products disappear from web/native shopping cards and product choices. Server checks reject new orders and reservations for archived products, including requests from older clients. Existing orders, invoices, inventory and credit history remain intact. Product records remain available for historical order labels and staff management.

Archiving releases any unsubmitted reserved cart containing that product, including holds on its other lines. Families must rebuild those carts. Existing submitted orders can still be paid, fulfilled or cancelled through the existing rules. Restore makes the product available again but does not reactivate released carts. Stale local cart drafts may still display a retired line; the family must remove it before reserving again.

Archived plays leave the active playbook and are excluded from family/player play responses. Authorized coaches/staff can view the archive and restore the original frames, notes and routes. Editing an archived item does not restore it. Both archive and restore actions are recorded in the activity log. No permanent-delete control was added.

## Validation

All 110 automated tests pass. New coverage verifies staff/team authorization, released reservations, rejection of stale shopping requests, retained orders/invoices/product references, checkout idempotency, cancellation after archive and reversible play visibility. Web build and iOS/Android exports pass. Browser checks archived/restored a sample product and play; both were restored afterward. Physical-phone and live-provider acceptance remain outstanding.
