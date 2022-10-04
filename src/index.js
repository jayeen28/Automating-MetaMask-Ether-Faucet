require('dotenv').config();
const db = require('./db');
const Web3 = require('web3');
const Accounts = require('web3-eth-accounts');
const accountGen = new Accounts(process.env.NODE_URL);
const { exec } = require('child_process');
const HDWalletProvider = require("@truffle/hdwallet-provider");

// sleep function
const sleep = async ms => {
    console.log('Sleeping . . .');
    return new Promise((resolve) => setTimeout(() => resolve(), ms))
};

/**
 * 
 * @param {String} status This function is used for getting accounts from db.
 * @returns It returns the promise of the query to db.
 */
const getAcc = status => db.tables.Accounts.find({ status });

// This function is used for getting money.
const getEth = async () => {
    try {
        console.log('Getting money');
        let accounts = await getAcc('empty');
        for (let account of accounts) {
            // request to get eth
            const response = await new Promise((resolve, reject) => {
                exec(`curl -x socks5h://localhost:9050 -X POST --data "${account.address}" \ -H "Content-Type:application/text" https://faucet.metamask.io/v0/request -l "US"`, (err, stdout, stderr) => {
                    resolve(stdout);
                    reject(err.message)
                })
            });
            // If response not starts with 0x then something went wrong in the metamask faucet server. Either the account has enough eth or the server responded with bad gateway message.
            if (!response.startsWith('0x')) {
                console.log({ account: account.address, status: `Can not take more. Error:${response}` })
                account.status = 'filled';
                await account.save();
                continue;
            };
            console.log({ account: account.address, status: `TrxHash: ${response}` });
        }
        accounts = await getAcc('empty');
        // If empty accounts still exists in db then call this function again.
        if (accounts.length) await getEth();
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

const sendEth = async () => {
    try {
        let accounts = await getAcc('filled');
        for (let account of accounts) {
            await sleep(2000);
            console.log({ account: account.address, status: 'Sending money . . .' })
            let provider = new HDWalletProvider([account.privateKey], process.env.NODE_URL);
            const web3 = new Web3(provider);
            // get the balance of the account.
            const balance = await web3.eth.getBalance(account.address);
            // get gas
            const currentGas = await web3.eth.getGasPrice();
            const requiredGasPrice = await web3.eth.estimateGas({ to: process.env.MASTER });
            const gas = currentGas * requiredGasPrice;
            const amount = balance - gas;
            // detect empty wallet
            if (amount <= 0) {
                console.log({ account: account.address, status: 'No balance.' })
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
            // process transaction
            const signedTx = await web3.eth.accounts.signTransaction(transaction, account.privateKey);
            const response = await new Promise((resolve, reject) => {
                web3.eth.sendSignedTransaction(signedTx.rawTransaction, (error, hash) => {
                    if (error) reject({ account: account.address, status: "❗ Something went wrong while submitting your transaction" });
                    resolve({ account: account.address, status: `🎉 The hash of your transaction is ${hash}` });
                })
            });
            console.log(response);
        };
        accounts = await getAcc('filled');
        // If anymore account exists with ether in db then call this function again
        if (accounts.length) await sendEth();
        else return 'done';
    }
    catch (e) {
        console.log(e);
    }
}

const main = async () => {
    try {
        await db.connect();
        await getEth();
        console.log('Get Money done.');
        await sendEth();
        console.log('Send money done.');
    }
    catch (e) {
        main();
        console.log(e);
    }
};

main();