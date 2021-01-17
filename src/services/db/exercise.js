const mongoose = require("mongoose");

const { Schema } = mongoose;
const { model } = mongoose;

const exerciseSchema = Schema({
  userId: String,
  description: String,
  duration: Number,
  date: Date,
});

const exerciseModel = model("exercises", exerciseSchema);

const addExercise = async (userId, description, duration, date) => {
  try {
    date = new Date(date);
    if (date === "Invalid Date") date = new Date();
    if (duration <= 0) duration = 1;
    const docs = await exerciseModel.create({
      userId: userId,
      description: description,
      duration: duration,
      date: date,
    });
    console.log(`l'exercise a été ajouté a la base de données!`);
    return docs;
  } catch (error) {
    console.log(`Erreur: l'exercise n'a pas été ajouté a la base de données !`);
    return false;
  }
};

const findExerciseByUserId = async (id) => {
  try {
    const docs = await exerciseModel.find({ userId: id });
    return docs;
  } catch (error) {
    throw error;
  }
};

const findExerciseByFilter = async (uId, from = 0, to = 0, limit = 0) => {
  try {
    let filter = { $lte: to, $gte: from };
    if (to === 0 && from === 0) filter = 0;
    else if (to === 0) filter = { $gte: from };
    else if (from === 0) filter = { $lte: to };

    const toFind =
      filter !== 0
        ? exerciseModel.find({ userId: uId, date: filter })
        : exerciseModel.find({ userId: uId });
    const docs =
      limit > 0 ? await toFind.exec() : await toFind.limit(limit).exec();

    const result = [];
    docs.forEach(({ userId, description, duration, date }) =>
      result.push({ userId, description, duration, date })
    );
    return result;
  } catch (error) {
    throw error;
  }
};

const findAll = async () => {
  try {
    const docs = await exerciseModel.find();
    return docs;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  addExercise,
  findExerciseByUserId,
  findExerciseByFilter,
  findAll,
};
