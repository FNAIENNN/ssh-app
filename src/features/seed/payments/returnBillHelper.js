import { supabase, TABLES } from '../../../lib/supabaseClient';
import { uploadPaymentEvidence } from '../../../components/payments/mediaEvidence';

/**
 * Upload return evidence to Supabase storage and return only its object path.
 * A failed or empty upload aborts the return so no bill can reference missing media.
 */
export async function uploadReturnMedia(media, prefix, folder = 'return-evidence') {
  if (!media) return null;
  return uploadPaymentEvidence(supabase.storage, media, prefix, folder);
}

/**
 * Shared Return Bill creator for:
 * - Packing Return
 * - Mixed → Packing Return
 * - Seed Van Return
 * - Mixed → Seed Van Return
 */
export async function generateReturnBill({
  siteId,
  userId,
  activeOrder,
  vehicleNo = '—',
  tankId = null,
  tankName = '—',
  sourceQty = 0,
  returnedQty = 0,
  remainingQty = 0,
  returnedPackets = 0,
  reason = '',
  photo = null,
  video = null,
  source = 'Packing', // 'Mixed - Packing' | 'Mixed - Seed Van' | 'Packing' | 'Seed Van'
}) {
  const cleanSiteId = siteId || activeOrder?.site_id || 'default-site';

  const cleanVehicleNo = vehicleNo && vehicleNo !== 'N/A' ? vehicleNo : (activeOrder?.vehicle_no || '—');
  const cleanTankName = tankName && tankName !== 'N/A' ? tankName : '—';

  // 1. Upload and verify media before creating the return bill.
  let photoPath = null;
  let videoPath = null;

  const mediaPrefixKey = (tankId || cleanTankName || 'tank').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  const orderKey = (activeOrder?.id || activeOrder?.bill_number || 'order').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  const vehicleKey = cleanVehicleNo.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  const mediaFolder = `return-evidence/${orderKey}/${vehicleKey}/${mediaPrefixKey}`;
  if (photo) {
    photoPath = await uploadReturnMedia(photo, 'photo', mediaFolder);
  }
  if (video) {
    videoPath = await uploadReturnMedia(video, 'video', mediaFolder);
  }

  const now = new Date();
  const billNumber = `RB-${Date.now().toString().slice(-6)}`;

  const numSourceQty = Number(sourceQty) || 0;
  const numReturnedQty = Number(returnedQty) || 0;
  const numRemainingQty = Number(remainingQty) || 0;
  const numPackets = Number(returnedPackets) || 0;
  const cleanReason = reason || '';
  const validCreatedBy = userId || null;

  const numPerPiecePrice = Number(activeOrder?.per_piece_price) || 0;
  const numRefundAmount = numReturnedQty * numPerPiecePrice;

  const packingDataObj = {
    order_id: activeOrder?.id || null,
    order_number: activeOrder?.bill_number || 'N/A',
    tank_id: tankId,
    tank_name: cleanTankName,
    vehicle_no: cleanVehicleNo,
    source_qty: numSourceQty,
    quantity: numReturnedQty,
    returned_qty: numReturnedQty,
    remaining_qty: numRemainingQty,
    packets: numPackets,
    reason: cleanReason,
    photo: photoPath,
    video: videoPath,
    return_date: now.toLocaleDateString('en-IN'),
    return_time: now.toLocaleTimeString('en-IN'),
    return_status: 'Returned'
  };

  const payload = {
    site_id: cleanSiteId,
    bill_number: billNumber,
    type: 'return_bill',
    report_type: 'return_bill',
    status: 'completed',
    ...(validCreatedBy ? { created_by: validCreatedBy } : {}),
    total_amount: numRefundAmount,
    paid_amount: numRefundAmount,
    balance_amount: 0,
    hatchery: activeOrder?.hatchery || 'N/A',
    supervisor_name: activeOrder?.supervisor_name || 'Field Supervisor',
    created_at: now.toISOString(),
    document_data: {
      original_bill_id: activeOrder?.id || null,
      original_bill_number: activeOrder?.bill_number || 'N/A',
      return_source: source,
      source: source,
      vehicle: cleanVehicleNo,
      vehicle_no: cleanVehicleNo,
      tank: cleanTankName,
      tank_name: cleanTankName,
      original_tank: cleanTankName,
      drum_name: cleanTankName,
      source_qty: numSourceQty,
      returned_qty: numReturnedQty,
      seed_count_returned: numReturnedQty,
      remaining_qty: numRemainingQty,
      packets: numPackets,
      reason: cleanReason,
      photo: photoPath,
      video: videoPath,
      finance_status: 'pending_finance',
      date: now.toISOString(),
      return_date: now.toLocaleDateString('en-IN'),
      return_time: now.toLocaleTimeString('en-IN'),
      return_status: 'Returned',
      per_piece_price: numPerPiecePrice,
      refund_amount: numRefundAmount,
      packing_data: packingDataObj
    }
  };

  let savedBill = null;
  try {
    const { data: billData, error: billError } = await supabase
      .from(TABLES.bills)
      .insert(payload)
      .select();

    if (billError) {
      console.error('Supabase insert return bill error:', billError);
      throw new Error(`Failed to save Return Bill: ${billError.message || JSON.stringify(billError)}`);
    } else {
      savedBill = (Array.isArray(billData) ? billData[0] : billData);
    }
  } catch (err) {
    console.error('Failed to insert return bill into Supabase:', err);
    throw err;
  }

  // Also insert payment record into TABLES.payments for complete store persistence
  try {
    const paymentPayload = {
      site_id: cleanSiteId,
      bill_id: savedBill.id,
      type: 'return',
      method: 'return',
      amount: numRefundAmount,
      status: 'returned',
      hatchery: activeOrder?.hatchery || 'N/A',
      holder_name: activeOrder?.hatchery || 'N/A',
      supervisor_name: activeOrder?.supervisor_name || 'Field Supervisor',
      ...(validCreatedBy ? { created_by: validCreatedBy } : {}),
      created_at: now.toISOString(),
      note: cleanReason,
      document_data: payload.document_data,
    };
    await supabase.from(TABLES.payments).insert(paymentPayload);
  } catch (pErr) {
    console.warn('Supabase insert return payment error:', pErr);
  }

  return { bill: savedBill, photoPath, videoPath };
}