const mongoose = require('mongoose');
const Accounts = require('./accounts.js');

const tables = {
    Accounts
};

const connect = async () => new Promise((resolve, reject) => mongoose.connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}, err => {
    if (err) reject(err.message);
    console.log('Mongodb connected.')
    resolve();
}));

module.exports = { connect, tables };