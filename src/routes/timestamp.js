const { Router } = require("express");
const ts = require("../controller/timestamp");

const router = new Router();

router.get("/", ts.getTimestamp);
router.get("/:param", ts.getParamTimestamp);

module.exports = router;
