import mongoose from "mongoose";
import express from "express";
import config from "./config/config.js"
import { userModel, memberDetailsModel, totalSavingsModel } from "./schemas/index.js";
import cors from "cors";

const app = express();
const port = config.port || 3001;
app.use(express.json());
app.use(cors());

mongoose.connect(config.mongodUri, { dbName: "AssociationFunds" });

app.post(`${config.requestBaseUrl}login`, async (req, res) => {
  const number = req.body.phone;
  try {
    const userData = await userModel.findOne({"data.phone": number});
    if (userData) {
      if (userData.data.role === "host"){
        const member = await memberDetailsModel.findOne({ "data.auth": userData._id }, "data").populate([
          {path: "data.totalSavings"},
          {path: "data.auth", select: "data"},
        ]);
        const members = await memberDetailsModel.find({}, "data").populate("data.auth", "data");
        res.status(200).send({member, members});
      } else if (userData.data.role === "member") {
        const member = await memberDetailsModel.findOne({ "data.auth": userData._id }, "data").populate([
          {path: "data.totalSavings"},
          {path: "data.auth", select: "data"},
        ]);
        res.status(200).send({member});
      } else {
        res.status(404).send('');
      }
    } else {
      res.status(404).send('');
    }
  } catch (error) {
    throw error
  }
});

app.post(`${config.requestBaseUrl}add-member`, async (req, res) => {
  const name = req.body.name;
  const phone = req.body.phone;
  try {
    const totalSavingsId = await totalSavingsModel.findOne({});
    const userData = await userModel.create({
      data: {
        name: name,
        phone: phone,
        role: "member",
      }
    })
    const newMember = await memberDetailsModel.create({
      data: {
        auth: userData._id,
        totalSavings: totalSavingsId._id,
        saving: 0,
        loanRemaining: 0,
      },
    })
    const member = await memberDetailsModel.findOne({ _id: newMember._id }, "data").populate([
      {path: "data.totalSavings"},
      {path: "data.auth", select: "data"},
    ]);
    res.status(200).send(member);
  } catch (error) {
    res.status(409).send(error);
  }
});

app.post(`${config.requestBaseUrl}get-member-details`, async (req, res) => {
  const id = req.body.id
  try {
    const member = await memberDetailsModel.findOne({ _id: id }, 'data').populate([
      {path: "data.totalSavings"},
      {path: "data.auth", select: "data"},
    ]);
    res.status(200).send(member);
  } catch (error) {
    res.status(400).send(error);
  }
});

app.post(`${config.requestBaseUrl}add-savings`, async (req, res) => {
  const userId = req.body.id
  const amount = req.body.amount
  const year = req.body.year
  const month = req.body.month
  const date = req.body.date
  try {
    await memberDetailsModel.findOneAndUpdate(
      {
        _id: userId,
      },
      {
        "metaData.lastUpdated": date,
        $inc: {
          "data.saving": amount,
        },
        $push: {
          "data.savingDetails": {
            amount: amount,
            month: month,
            year: year,
          }
        }
      },
    )
    await totalSavingsModel.findOneAndUpdate(
      {},
      {
        $inc: {
          "totalSavings": amount,
        }
      }
    )
    res.status(200).send("ok");
  } catch (error) {
    res.status(400).send(error)
  }
});

app.post(`${config.requestBaseUrl}add-loan-installment`, async (req, res) => {
  const userId = req.body.id
  const amount = req.body.amount
  const year = req.body.year
  const month = req.body.month
  const date = req.body.date
  try {
    const member = await memberDetailsModel.findOne({_id: userId,}, 'data')
    if (member.data.loanRemaining === 0) {
      res.status(400).send("Member has no loan pending")
    } else {
      await memberDetailsModel.findOneAndUpdate(
        {
          _id: userId,
        },
        {
          "metaData.lastUpdated": date,
          $inc: {
            "data.loanRemaining": -amount,
          },
          $push: {
            "data.loanDetails": {
              amount: amount,
              month: month,
              year: year,
            }
          }
        },
      )
      await totalSavingsModel.findOneAndUpdate(
        {},
        {
          $inc: {
            "totalSavings": amount,
          }
        }
      )
      const updatedMember = await memberDetailsModel.findOne({_id: userId,}, 'data')
      if (updatedMember.data.loanRemaining === 0) {
        await memberDetailsModel.findOneAndUpdate(
          {
            _id: userId,
          },
          {
            $unset: { 'data.loanDate': 1 }
          }
        )
      }
      res.status(200).send('ok');
    }
  } catch (error) {
    res.status(400).send(error)
  }
});

app.post(`${config.requestBaseUrl}give-loan`, async (req, res) => {
  const userId = req.body.id
  const amount = req.body.amount
  const loanDate = req.body.loanDate
  const date = req.body.date
  try {
    await memberDetailsModel.findOneAndUpdate(
      {
        _id: userId,
      },
      {
        "metaData.lastUpdated": date,
        $inc: {
          "data.loanRemaining": amount,
        },
        "data.loanDate": loanDate,
      },
    )
    await totalSavingsModel.findOneAndUpdate(
      {},
      {
        $inc: {
          "totalSavings": -amount,
        }
      }
    )
    res.status(200).send('ok');
  } catch (error) {
    res.status(400).send(error)
  }
});

app.delete(`${config.requestBaseUrl}delete-member/:id/:phone`, async (req, res) => {
  const phone = req.params.phone;
  const id = req.params.id;
  try {
    const authResponse = await userModel.deleteOne({'data.phone': phone})
    const memberResponse = await memberDetailsModel.deleteOne({_id: id})
    res.status(200).send({authResponse, memberResponse});
  } catch (error) {
    res.status(400).send(error);
  }
});

app.get("/health-check", (req, res) => {
  try{
    res.status(200).send("ok")
  } catch (error) {
    res.status(500).send({error: error})
  }
});

app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});

// {name: 'Ummehani Cyclewala', savings: 37000,},
// {name: 'Fatema Amet', savings: 37000,},
// {name: 'Shabnam Amet', savings: 37000,},
// {name: 'Sakina Khilona', savings: 37000,},
// {name: 'Tasneem Rassa', savings: 37000,},
// {name: 'Jumana Amet', savings: 37000,},
// {name: 'Tasneem Bhadsora', savings: 37000,},
// {name: 'Rashida Pamalpur', savings: 37000,},
// {name: 'Jumana Gadi Saaz', savings: 37000,},
// {name: 'Shabana Amet', savings: 37000,},
// {name: 'Munira Amet', savings: 37000,},