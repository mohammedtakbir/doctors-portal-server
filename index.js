const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5001;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

//* middleware
app.use(cors());
app.use(express.json());

app.get('/', async (req, res) => {
    res.send('doctors portal server is running!')
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.drjbcpx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded
        next();
    })
}

async function run() {
    try {
        const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('bookings');
        const usersCollection = client.db('doctorsPortal').collection('users');
        const doctorsCollection = client.db('doctorsPortal').collection('doctors');
        const paymentsCollection = client.db('doctorsPortal').collection('payments');

        //* Note: make sure you use verifyAdmin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (decodedEmail !== email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email }
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings)
        })

        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {};
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result)
        })

        /* 
        ? API Naming Convention
        * app.get('/bookings')
        * app.get('/bookings/:id')
        * app.post('/bookings')
        * app.patch('/bookings/:id')
        * app.delete('/bookings/:id')
        */

        app.get('/appointmentOptions', async (req, res) => {
            const query = {};
            const date = req.query.date;
            const cursor = appointmentOptionCollection.find(query);
            const options = await cursor.toArray();

            //* get the bookings of the provided date
            const bookingQuery = { appointmentDate: date };
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlot = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlot.includes(slot))
                option.slots = remainingSlots;
            })
            res.send(options);
        })

        //* use aggregate to query multiple collection and merge data
        app.post('/bookings', async (req, res) => {
            const booking = req.body;

            const query = {
                appointmentDate: booking.appointmentDate,
                treatment: booking.treatment,
                email: booking.email
            }
            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({ acknowledge: false, message })
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingsCollection.findOne(query);
            res.send(booking);
        })

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                "payment_method_types": [
                    "card"
                ],
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const id = payment.bookingId;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            };
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc);
            const result = await paymentsCollection.insertOne(payment);
            res.send(result);
        })

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' });
                return res.send({ token });
            }
            res.status(403).send({ accessToken: '' })
        })

        //* get all users
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })

        //* store user info
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' })
        })

        //* make admin
        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const option = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await usersCollection.updateOne(filter, updatedDoc, option);
            res.send(result);
        })

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        })

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result)
        })

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })

        //* temporary to update price field on appointment options
        /*  app.get('/addPrice', async (req, res) => {
             const filter = {};
             const options = { upsert: true };
             const updatedDoc = {
                 $set: {
                     price: 99
                 }
             };
             const result = await appointmentOptionCollection.updateMany(filter, updatedDoc, options);
             res.send(result);
         }) */

    }
    finally {

    }
}
run().catch(err => console.log(err))

app.listen(port, () => {
    console.log(`doctors portal server is running on ${port} port`)
})