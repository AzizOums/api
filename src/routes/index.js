const { Router } = require("express");

const timestamp = require("./timestamp");
const headers = require("./headers");
const shorturl = require("./shorturl");
const exercise = require("./exercise");
const fileanalyse = require("./fileanalyse");
const readfile = require("./readfile");

const router = new Router();

router.use("/timestamp", timestamp);
router.use("/headers", headers);
router.use("/shorturl", shorturl);
router.use("/exercise", exercise);
router.use("/fileanalyse", fileanalyse);
router.use("/readfile", readfile);

module.exports = router;
