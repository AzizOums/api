const { Router } = require("express");
const headers = require("../controller/headers");

const router = new Router();

router.get("/", headers);

module.exports = router;
