// Shipment status — the courier-driven status shown in the "Shipment status"
// column and timeline. Separate from the short ORDER status (PENDING … DELIVERED).
//
//   BOOKED → PICKUP_SCHEDULED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
//   exceptions: DELIVERY_FAILED, RTO_INITIATED, RTO_DELIVERED
//   (a cancelled booking clears the shipment status; CANCELLED only appears in history)

const FLOW = ['BOOKED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const EXCEPTIONS = ['DELIVERY_FAILED', 'RTO_INITIATED', 'RTO_DELIVERED'];
const ALL = [...FLOW, ...EXCEPTIONS, 'CANCELLED'];
const TERMINAL = ['DELIVERED', 'RTO_DELIVERED', 'CANCELLED'];

const LABELS = {
  BOOKED: 'Booked', PICKUP_SCHEDULED: 'Pickup scheduled', PICKED_UP: 'Picked up', IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', DELIVERY_FAILED: 'Delivery failed',
  RTO_INITIATED: 'Returning to you', RTO_DELIVERED: 'Returned to you', CANCELLED: 'Cancelled',
};

// Amazon Easy Ship `packageStatus` values (exact, case-sensitive in the API).
const AMAZON_PACKAGE = {
  ReadyForPickup: 'PICKUP_SCHEDULED',
  PickedUp: 'PICKED_UP',
  AtOriginFC: 'IN_TRANSIT',
  AtDestinationFC: 'IN_TRANSIT',
  OutForDelivery: 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  Undeliverable: 'DELIVERY_FAILED',
  Rejected: 'DELIVERY_FAILED',
  DamagedInTransit: 'DELIVERY_FAILED',
  LostInTransit: 'DELIVERY_FAILED',
  ReturnedToSeller: 'RTO_DELIVERED',
  LabelCanceled: 'CANCELLED',
};

// Turn whatever a courier (or Amazon) calls a status into one of ours, or null
// when we can't tell (then nothing changes). Courier wording varies ("PICKUP
// SCHEDULED", "Out For Delivery", "RTO Initiated", "Undelivered - consignee
// unavailable" …), so this is keyword based, most specific first.
function normalizeStatus(raw) {
  if (raw == null) return null;
  const exact = String(raw).trim();
  if (AMAZON_PACKAGE[exact]) return AMAZON_PACKAGE[exact];
  const s = exact.toLowerCase().replace(/[_-]+/g, ' ');
  if (!s) return null;
  if (/cancel/.test(s)) return 'CANCELLED';
  if (/\brto\b|return to origin|returned to origin|return to seller|returning/.test(s)) {
    return /deliver|received|reached|completed/.test(s) ? 'RTO_DELIVERED' : 'RTO_INITIATED';
  }
  if (/undeliver|not delivered|delivery (failed|attempt)|attempt(ed)? (failed|made)|ndr|consignee (unavailable|refused)|refused|lost|damaged/.test(s)) return 'DELIVERY_FAILED';
  if (/out for delivery|\bofd\b/.test(s)) return 'OUT_FOR_DELIVERY';
  if (/deliver/.test(s)) return 'DELIVERED';
  if (/in transit|transit|dispatched|shipped|reached|arrived|hub|departed|forwarded|bagged/.test(s)) return 'IN_TRANSIT';
  if (/pick(ed)? ?up (done|complete|completed)|picked up|picked|collected|pickup done/.test(s)) return 'PICKED_UP';
  if (/pick ?up (scheduled|pending|generated|requested|awaited|not done)|awaiting pick ?up|ready for pick ?up|pick ?up/.test(s)) return 'PICKUP_SCHEDULED';
  if (/booked|manifest|awb (assigned|generated)|created|new|label (created|generated)/.test(s)) return 'BOOKED';
  return null;
}

// Order status that goes with a shipment status.
function orderStatusFor(shipmentStatus) {
  switch (shipmentStatus) {
    case 'BOOKED': case 'PICKUP_SCHEDULED': return 'CONFIRMED';
    case 'PICKED_UP': case 'IN_TRANSIT': case 'OUT_FOR_DELIVERY': case 'DELIVERY_FAILED': case 'RTO_INITIATED': return 'SHIPPED';
    case 'DELIVERED': return 'DELIVERED';
    case 'RTO_DELIVERED': return 'RETURNED';
    default: return null;
  }
}

// Is `next` a legitimate move from `current`? Forward only along the main flow
// (a late or repeated report never drags a parcel backwards); exceptions can be
// entered from any shipped state; RTO can only follow a failed/shipped parcel.
function canMove(current, next) {
  if (!next) return false;
  if (!current) return true;
  if (current === next) return false;
  if (TERMINAL.includes(current)) return false;
  const ci = FLOW.indexOf(current);
  const ni = FLOW.indexOf(next);
  if (ni > -1) return ci === -1 ? true : ni > ci; // from an exception state, any forward state is a recovery
  if (next === 'DELIVERY_FAILED') return ci >= FLOW.indexOf('PICKED_UP') || current === 'DELIVERY_FAILED';
  if (next === 'RTO_INITIATED') return current !== 'RTO_INITIATED';
  if (next === 'RTO_DELIVERED') return true;
  return false;
}

module.exports = { FLOW, EXCEPTIONS, ALL, TERMINAL, LABELS, normalizeStatus, orderStatusFor, canMove };
