const functions = require("firebase-functions");
const express = require('express');
const moment = require('moment');
const Razorpay = require('razorpay');
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const cors = require('cors');
var { validatePaymentVerification } = require('razorpay/dist/utils/razorpay-utils');
const { DataSnapshot } = require("firebase-functions/v1/database");
initializeApp();
const db = getFirestore();
const tempOrdersRef = db.collection('orders');
const app = express();
const key_secret = 'DI2hALUlSp5N33ayXLwP9LgP';
// Automatically allow cross-origin requests
app.use(cors({ origin: true }));
var instance = new Razorpay({
    key_id: 'rzp_test_0nXcvC2sgAi0cg',
    key_secret: 'DI2hALUlSp5N33ayXLwP9LgP',
});

const asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
};

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.pgCreateOrder = functions.https.onRequest(app);
// const pincodes = require('../../petalsatdoor-nodejs/pincodes.json');
// const settings = require('../../petalsatdoor-nodejs/settings.json');


// const docRef = db.collection('deliveryLocations').doc('chennai');

//  docRef.set({
//     locations: pincodes
// });

// const docRef1 = db.collection('settings').doc('settings');

//  docRef1.set(settings);


app.post('/', async (request, response) => {
    const reqData = {
        "amount": request.body.amount,
        "currency": request.body.currency,
        "receipt": request.body.receipt,
        "uid": request.body.uid,
        "bookingRequestData": request.body
    };
    let validate = await validateheaders(request);
    if (!validate.success) {
        response.status(validate.errorCode).send(validate);
        return false;
    }
    functions.logger.info("Response!", { ...reqData });
    if (request.body.paymentType === 'payOnline') {
        let resp
        try {
            resp = await instance.orders.create({ amount: reqData.amount, currency: reqData.currency, receipt: reqData.receipt });
        } catch (error) {
            return {
                success: 'false',
                errorMessage: error,
                errorCode: 400
            }
        }
        functions.logger.info("Response!", resp);
        await tempOrdersRef.doc(resp.id).set({ createReq: reqData, createRes: resp, uid: request.body.uid, date: new Date(), paymentType: request.body.paymentType });
        response.send(resp);
    }
    else {
        let docRes = await tempOrdersRef.add({ createReq: reqData, createRes: {}, uid: request.body.uid, date: new Date(), paymentType: request.body.paymentType });
        const orderDocRef = db.collection('orders').doc(docRes.id);
        const doc = await orderDocRef.get();
        if (doc.exists) {
            await createSubscription(doc.data())
        }
        response.send({ success: true });
    }

});

app.put('/validate', async (request, response) => {
    functions.logger.info('Auth Validate: ', request.body);
    let validate = await validateheaders(request);
    if (!validate.success) {
        response.status(validate.errorCode).send(validate);
        return false;
    }
    let authReq = validatePaymentVerification({ "order_id": request.body.razorpay_order_id, "payment_id": request.body.razorpay_payment_id }, request.body.razorpay_signature, key_secret);
    functions.logger.info('Auth Complete: ', authReq);
    if (authReq) {
        let paymentDetails = await instance.payments.fetch(request.body.razorpay_payment_id);
        console.log(paymentDetails);
        await tempOrdersRef.doc(request.body.razorpay_order_id).set({ validateReq: { razorpay_order_id: request.body.razorpay_order_id, razorpay_payment_id: request.body.razorpay_payment_id, razorpay_signature: request.body.razorpay_signature }, validateRes: authReq, orderRes: paymentDetails }, { merge: true });
        const orderDocRef = db.collection('orders').doc(request.body.razorpay_order_id);
        const doc = await orderDocRef.get();
        if (doc.exists) {
            await createSubscription(doc.data())
        }
        paymentDetails.captured ? response.status(200).send({ success: authReq }) : response.status(400).send({ success: false })
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
    console.log(decodedToken.uid, requestedUid);
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
        return await getAuth().verifyIdToken(authToken, true);
    } catch (error) {
        console.log(error);
        return {
            success: 'false',
            errorMessage: error,
            errorCode: 401
        }
    }
}

async function createSubscription(data) {
    const subscriptionsRef = db.collection('subscriptions');
    let subscription = {};
    let slots = data.createReq.bookingRequestData.deliverySlot.split(' - ');
    await asyncForEach(data.createReq.bookingRequestData.cartData, async (item, index) => {
        let autoId = await getSubscriptionId();
        let customized = [];
        if (item?.customizeDays?.length > 0) {
            item.customizeDays.forEach(days => {
                if (days.selected) {
                    customized.push(days)
                }
            })
        }
        subscription = {
            productName: item.productName,
            productId: item.productId,
            subscriptionId: `S-${autoId + 1}`,
            autoIncrementID: autoId + 1,
            unit: item.productDetails.unit,
            quantity: item.productDetails.quantity,
            productQuantity: item.quantity,
            selectedFrequency: item.selectedFrequency,
            interval: item.selectedInterval ?? '',
            deliveryPreference: data.createReq.bookingRequestData.deliveryPreference, //
            customized: customized ?? [],
            zone: data.createReq.bookingRequestData.zone, //
            subZone: data.createReq.bookingRequestData.subZone, //
            uid: data.uid,
            createdDateTime: moment().format('YYYY-MM-DD hh:mm A'),
            startDateTime: moment(item.startDate, 'YYYY-MM-DD').format('YYYY-MM-DD hh:mm A'),
            endDateTime: '',
            status: 'active' /* active | closed */,
            selectedSlot: {
                startTime: slots[0],
                endTime: slots[1],
            },
            address: data.createReq.bookingRequestData.address,
            amount: item.amount,
            images: item.productDetails.images[0],
            perDayPrice: item.perDayPrice,
            city: data.createReq.bookingRequestData.city, //
            pincode: data.createReq.bookingRequestData.pincode,
            paymentOrderId: data?.validateReq?.razorpay_order_id ?? '',
            paymentType: data.paymentType,
            paymentStatus: data?.validateReq?.razorpay_order_id ? 'completed' : data?.offlinePayment?.status ? 'completed' : 'incomplete',
            pincode: data.createReq.bookingRequestData.pincode,
            vaccation: {}
        };
        console.log(subscription);
        await subscriptionsRef.add(subscription);
    })
}

async function getSubscriptionId() {
    const subscriptionsRef = db.collection('subscriptions');
    const lastThreeRes = await subscriptionsRef.orderBy('autoIncrementID', 'desc').limit(1).get();
    let autoId = 0;
    lastThreeRes.docs.forEach(doc => {
        autoId = doc.data().autoIncrementID
    })
    return autoId;
}

getSubscriptionId();