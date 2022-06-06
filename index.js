const functions = require("firebase-functions");
const express = require('express');
const Razorpay = require('razorpay');
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const cors = require('cors');
var { validatePaymentVerification } = require('razorpay/dist/utils/razorpay-utils');
const { request } = require("express");
const { response } = require("express");
initializeApp();
const db = getFirestore();
const tempOrdersRef = db.collection('tempOrders');
const app = express();
const key_secret = 'DI2hALUlSp5N33ayXLwP9LgP';
// Automatically allow cross-origin requests
app.use(cors({ origin: true }));
var instance = new Razorpay({
    key_id: 'rzp_test_0nXcvC2sgAi0cg',
    key_secret: 'DI2hALUlSp5N33ayXLwP9LgP',
});

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.pgCreateOrder = functions.https.onRequest(app);


app.post('/', async (request, response) => {
    const reqData = {
        "amount": request.body.amount,
        "currency": request.body.currency,
        "receipt": request.body.receipt,
    };
    functions.logger.info("Response!", { ...reqData, uid: 'hllRByCv75aKpuTkRjrdXdK6JgNT' });
    let resp = await instance.orders.create(reqData);
    functions.logger.info("Response!", resp);
    await tempOrdersRef.doc(resp.id).set({ createReq: reqData, createRes: resp, uid: 'hllRByCv75aKpuTkRjrdXdK6JgNT',date: new Date() });
    response.send(resp);
});

app.put('/validate', async (request, response) => {
    functions.logger.info('Auth Validate: ', request);
    let authReq = validatePaymentVerification({ "order_id": request.body.razorpay_order_id, "payment_id": request.body.razorpay_payment_id }, request.body.razorpay_signature, key_secret);
    functions.logger.info('Auth Complete: ', authReq);
    if (authReq) {
        let paymentDetails = await instance.payments.fetch(request.body.razorpay_payment_id);
        console.log(paymentDetails);
        paymentDetails.captured ? response.status(200).send({ success: authReq }) : response.status(400).send({ success: false })
        await tempOrdersRef.doc(request.body.razorpay_order_id).set({ validateReq: { razorpay_order_id: request.body.razorpay_order_id, razorpay_payment_id: request.body.razorpay_payment_id, razorpay_signature: request.body.razorpay_signature }, validateRes: authReq, orderRes: paymentDetails }, { merge: true });
    }
    else {
        response.status(400).send({ success: authReq });
        await tempOrdersRef.doc(request.body.razorpay_order_id).set({ validateReq: { razorpay_order_id: request.body.razorpay_order_id, razorpay_payment_id: request.body.razorpay_payment_id, razorpay_signature: request.body.razorpay_signature }, validateRes: authReq, orderRes: false }, { merge: true });

    }
})