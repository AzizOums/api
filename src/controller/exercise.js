const userTools = require("../services/db/users");
const exerciseTools = require("../services/db/exercise");

const createUser = async (req, res, next) => {
  const { username } = req.body;
  try {
    const data = await userTools.addUser(username);
    if (!data) return res.status(200).send({ Erreur: "username déjà utilisé" });
    return res.status(200).send(data);
  } catch (error) {
    console.log(error);
    return next({ status: 500, message: "server error" });
  }
};

const getUsers = async (req, res, next) => {
  try {
    const data = await userTools.findAll();
    res.status(200).send(data);
  } catch (error) {
    console.log(error);
    return next({ status: 500, message: "server error" });
  }
};

const addExercise = async (req, res, next) => {
  try {
    let { userId, description, duration, date } = req.body;
    if (!userTools.findUserById(userId))
      return res.status(200).send({ Erreur: "utilisateur inconnu" });
    const data = await exerciseTools.addExercise(
      userId,
      description,
      duration,
      date
    );
    if (!data)
      return res.status(500).send("Erreur lors de l'ajout de l'exercice");
    return res.status(200).send(data);
  } catch (error) {
    console.log(error);
    return next({ status: 500, message: "server error" });
  }
};

const getExercise = async (req, res, next) => {
  try {
    let { userId, from, to, limit } = req.query;
    from = new Date(from) == "Invalid Date" ? 0 : new Date(from);
    to = new Date(to) == "Invalid Date" ? 0 : new Date(to);
    limit = limit === undefined ? 0 : limit;

    const test = await userTools.idExist(userId);
    if (!test) return next({ status: 404, message: "utilisateur introuvale" });

    const username = await userTools.findUserById(userId);
    const docs = await exerciseTools.findExerciseByFilter(
      userId,
      from,
      to,
      limit
    );
    return res.status(200).send({ username: username, log: docs });
  } catch (error) {
    console.log(error);
    return next({ status: 500, message: "server error" });
  }
};

module.exports = {
  getUsers,
  createUser,
  addExercise,
  getExercise,
};
