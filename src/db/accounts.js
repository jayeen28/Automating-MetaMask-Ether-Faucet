const { Schema, model } = require('mongoose');

const accountSchema = new Schema({
    address: {
        type: String,
        required: true
    },
    privateKey: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'empty',
        enum: ['filled', 'empty']
    }
});

module.exports = model('Account', accountSchema);