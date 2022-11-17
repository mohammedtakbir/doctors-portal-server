const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5001;
const { MongoClient, ServerApiVersion } = require('mongodb');

//* middleware
app.use(cors());
app.use(express.json());

app.get('/', async (req, res) => {
    res.send('doctors portal server is running!')
})



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.drjbcpx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('bookings');

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
                const bookedSlot = optionBooked.map(book => book.slot );
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
            if(alreadyBooked.length){
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({acknowledge: false, message})
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })


    }
    finally {

    }
}
run().catch(err => console.log(err))

app.listen(port, () => {
    console.log(`doctors portal server is running on ${port} port`)
})