const functions = require("firebase-functions");
const express = require('express');
const Razorpay = require('razorpay');
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const cors = require('cors');
var { validatePaymentVerification } = require('razorpay/dist/utils/razorpay-utils');
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
        "uid": request.body.uid
    };
    let validate = await validateheaders(request);
    if(!validate.success)
    {
        response.status(validate.errorCode).send(validate);
        return false;
    }
    functions.logger.info("Response!", { ...reqData});
    let resp 
    try {
        resp = await instance.orders.create({amount: reqData.amount,currency: reqData.currency,receipt: reqData.receipt});
    } catch (error) {
        return {
            success: 'false',
            errorMessage: error,
            errorCode: 400
        }
    }
    functions.logger.info("Response!", resp);
    await tempOrdersRef.doc(resp.id).set({ createReq: reqData, createRes: resp, uid: request.body.uid, date: new Date() });
    response.send(resp);
});

app.put('/validate', async (request, response) => {
    functions.logger.info('Auth Validate: ', request.body);
    let validate = await validateheaders(request);
    if(!validate.success)
    {
        response.status(validate.errorCode).send(validate);
        return false;
    }
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

async function validateheaders(req) {
    let requestedUid = req.body.uid;
    let authToken;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        authToken = req.headers.authorization.split('Bearer ')[1];
    }
    if (!authToken) {
        return {
            success: false,
            errorCode: 403,
            message: 'Unauthorized! Missing Auth Token!'
        }
    }
    let decodedToken = await decodeAuthToken(authToken);
    console.log(decodedToken.uid,requestedUid);
    if (decodedToken.uid === requestedUid) {
        return {
            success: true
        }
    }
    else {
        return {
            success: false,
            errorCode: 401,
            message: 'Unauthorized! Invalid Auth Token!'
        }
    }
}

async function decodeAuthToken(authToken) {
    console.log(authToken);
    try {
        return await getAuth().verifyIdToken(authToken,true);
    } catch (error) {
        console.log(error);
        return {
            success: 'false',
            errorMessage: error,
            errorCode: 401
        }
    }
}