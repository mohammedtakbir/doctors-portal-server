const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5001;
const { MongoClient, ServerApiVersion } = require('mongodb');

//* middleware
app.use(cors());
app.use(express.json());

app.get('/', async(req, res) => {
    res.send('doctors portal server is running!')
})



const uri = "mongodb+srv://<username>:<password>@cluster0.drjbcpx.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });




app.listen(port, () => {
    console.log(`doctors portal server is running on ${port} port`)
})