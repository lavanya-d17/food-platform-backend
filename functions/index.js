const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const { FieldValue } = admin.firestore;

// FUNCTION 1: Runs every 15 mins, marks expired pickups
exports.safetyTimer = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const now = new Date();
    const snap = await db.collection('pickups')
      .where('status', '==', 'pending').get();

    const updates = snap.docs.map(async (doc) => {
      const expiresAt = doc.data().expiresAt.toDate();
      if (expiresAt < now) {
        await doc.ref.update({ status: 'expired' });
        console.log(`Expired pickup: ${doc.id}`);
      }
    });

    await Promise.all(updates);
    return null;
  });

// FUNCTION 2: Runs when a pickup is marked 'completed'
exports.onPickupComplete = functions.firestore
  .document('pickups/{pickupId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status === after.status) return null;
    if (after.status !== 'completed') return null;

    const kg = after.quantityKg || 0;
    const meals = Math.floor(kg * 2.5);
    const co2 = parseFloat((kg * 2.5).toFixed(2));

    await db.collection('impact').doc('global').set({
      totalMeals: FieldValue.increment(meals),
      totalKg: FieldValue.increment(kg),
      co2Saved: FieldValue.increment(co2),
      updatedAt: new Date()
    }, { merge: true });

    console.log(`Impact updated: +${meals} meals, +${kg}kg, +${co2}kg CO2`);
    return null;
  });