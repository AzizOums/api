const { Router } = require("express");
const {
  getUsers,
  createUser,
  addExercise,
  getExercise,
} = require("../controller/exercise");

const router = new Router();

router.get("/users", getUsers);
router.get("/log", getExercise);
router.post("/new-user", createUser);
router.post("/add", addExercise);

module.exports = router;
