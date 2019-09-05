const keys = require('./keys');

// Express App Setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
// Middleware
app.use(cors());
app.use(bodyParser.json());

// Postgres Client Setup
const { Pool } = require('pg');
const pgClient = new Pool({
    user: keys.pgUser,
    host: keys.pgHost,
    database: keys.pgDatabase,
    password: keys.pgPassword,
    port: keys.pgPort
}); 
pgClient.on('error', () => console.log('Lost PG connection'));

pgClient.query('CREATE TABLE IF NOT EXISTS values (number INT)')
    .catch(err => console.log(err));

// Redis Client Setup
const redis = require('redis');
const redisClient = redis.createClient({
    host: keys.redisHost,
    port: keys.redisPort,
    // if you lose connection to redis server -> try to reconnect once every 1 second (1000ms)
    retry_strategy: () => 1000
});
/* 
    Note: Dublicate
    The redis server is listening and pushing data
    So we need 2 connections to achieve this
*/
const redisPublisher = redisClient.duplicate();

// Express Route Handlers

app.get('/', (req, res) => {
    res.send('Hi');
});

app.get('/values/all', async (req, res) => {
    const values = await pgClient.query('SELECT * from values');

    res.send(values.rows);
});

app.get('/values/current', async (req, res) => {
    // Get all the values from the redis server
    redisClient.hgetall('values', (err, values) => {
        res.send(values);
    });
});

app.post('/values', async (req, res) => {
    const index = req.body.index;

    if (parseInt(index) > 40) {
        return res.status(422).send('Index too high');
    }

    // Insert the value to redis
    redisClient.hset('values', index, 'Nothing yet!');
    // Wake up worker and calc the fib for the new redis entry | pull & cacl new index 
    redisPublisher.publish('insert', index);
    // Add index to DB
    pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);

    res.send({working: true});
})

app.listen(5000, err => {
    console.log('Listening');
});