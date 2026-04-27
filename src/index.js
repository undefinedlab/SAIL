import chalk from "chalk";

const rainbow = [
  chalk.red("R"),
  chalk.yellow("A"),
  chalk.green("I"),
  chalk.cyan("N"),
  chalk.blue("B"),
  chalk.magenta("O"),
  chalk.red("W"),
];

const title = rainbow.join("");

console.log(chalk.bold(`${title} CLI starter`));
console.log(chalk.gray("Your Node project scaffolding is ready."));
console.log(chalk.white("Run: ") + chalk.green("npm start"));
