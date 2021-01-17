const { Router } = require("express");
const { get } = require("../controller/readfile");

const router = new Router();

router.get("/", get);

module.exports = router;
