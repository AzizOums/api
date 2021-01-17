const { Router } = require("express");
const {
  getShortURL,
  postShortURL,
  redirectShortURL,
} = require("../controller/shorturl");

const router = new Router();

router.get("/", getShortURL);
router.get("/:param", redirectShortURL);
router.post("/new", postShortURL);

module.exports = router;
