const { Router } = require("express");
const { getFile, postFile } = require("../controller/fileanalyse");

const router = new Router();

router.get("/", getFile);
router.post("/", postFile);

module.exports = router;
