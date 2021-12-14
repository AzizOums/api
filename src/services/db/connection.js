const mongoose = require("mongoose");

const uri = process.env.MONGO_URI;

const connect = async () => {
  try {
    await mongoose.connect(uri, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
    });
    console.log("connected to MongoDB");
  } catch (err) {
    console.log(err.message);
  }
};

module.exports = { connect };
