require('dotenv').config();
const db = require('./db');
const Web3 = require('web3');
const Accounts = require('web3-eth-accounts');
const accountGen = new Accounts(process.env.NODE_URL);
const { exec } = require('child_process');
const HDWalletProvider = require("@truffle/hdwallet-provider");

const sleep = async ms => {
    console.log('Sleeping . . .');
    return new Promise((resolve) => setTimeout(() => resolve(), ms))
};

const getMoney = async () => {
    try {
        let getAcc = async () => await db.tables.Accounts.find({ status: 'empty' });
        let accounts = await getAcc();
        for (let account of accounts) {
            const response = await new Promise((resolve, reject) => {
                exec(`curl -x socks5h://localhost:9050 -X POST --data "${account.address}" \ -H "Content-Type:application/text" https://faucet.metamask.io/v0/request -l "US"`, (err, stdout, stderr) => {
                    resolve(stdout);
                    reject(err.message)
                })
            });
            if (response.startsWith('{')) {
                console.log(response)
                account.status = 'filled';
                await account.save();
                continue;
            };
            console.log({ trxHash: response });
        }
        accounts = await getAcc();
        if (accounts.length) getMoney();
        else return 'done';
    }
    catch (e) {
        console.log(e);
    }
};

const createAccount = async count => {
    for (let i = 0; i < count; i++) {
        const { address, privateKey } = await accountGen.create();
        const account = await new db.tables.Accounts({ address, privateKey });
        await account.save();
    };
    return 'done';
};

const sendMoney = async () => {
    try {
        const getAcc = async () => await await db.tables.Accounts.find({ status: 'filled' });
        let accounts = await getAcc();
        for (let account of accounts) {
            // await sleep(5000);
            console.log('Sending money . . .')
            let provider = new HDWalletProvider([account.privateKey], process.env.NODE_URL);
            const web3 = new Web3(provider);
            const balance = await web3.eth.getBalance(account.address);

            const currentGas = await web3.eth.getGasPrice();
            const requiredGasPrice = await web3.eth.estimateGas({ to: process.env.MASTER });
            const gas = currentGas * requiredGasPrice;
            const amount = balance - gas;
            if (amount <= 0) {
                account.status = 'empty';
                await account.save();
                continue;
            };
            const nonce = await web3.eth.getTransactionCount(account.address, 'latest');
            const transaction = {
                'to': process.env.MASTER,
                'value': amount,
                'gas': requiredGasPrice,
                'gasPrice': currentGas,
                'data': '0x',
                'nonce': nonce
            };

            const signedTx = await web3.eth.accounts.signTransaction(transaction, account.privateKey);
            const response = await new Promise((resolve, reject) => {
                web3.eth.sendSignedTransaction(signedTx.rawTransaction, (error, hash) => {
                    if (error) reject({ "❗ Something went wrong while submitting your transaction": error });
                    resolve({ "🎉 The hash of your transaction is": hash });
                })
            });
            console.log(response);
            accounts = await getAcc();
            if (accounts.length) sendMoney();
            else return 'done';
        };
    }
    catch (e) {
        console.log(e);
    }
}

const main = async () => {
    try {
        await db.connect();
        // createAccount(300);
        // await getMoney();
        // console.log('Get Money done.');
        await sendMoney();
        console.log('Send money done.')
        // main();
    }
    catch (e) {
        console.log(e);
    }
};

main();