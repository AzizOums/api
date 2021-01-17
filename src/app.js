require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");

const routes = require("./routes");
const { connect } = require("./services/db/connection");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use("/api", routes);
app.use((err, req, res, next) => res.status(err.status).send(err.message));

connect();

module.exports = app;
