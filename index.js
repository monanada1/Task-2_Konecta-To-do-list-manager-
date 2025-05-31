#!/usr/bin/env node
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import inquirer from 'inquirer';
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import dayjs from 'dayjs';
import { Table } from 'cli-table3';
import { z } from 'zod';

// Initialize database
const adapter = new JSONFile('db.json');
const db = new Low(adapter);

// Task schema for validation
const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title cannot be empty"),
  description: z.string(),
  dueDate: z.string().refine((val) => dayjs(val).isValid(), {
    message: "Invalid date format",
  }),
  createdAt: z.string(),
  priority: z.number().min(1).max(3),
  completed: z.boolean(),
});

// Initialize database with default data
async function initializeDB() {
  await db.read();
  db.data ||= { tasks: [] };
  await db.write();
}

// Display welcome message
function showWelcome() {
  console.log(
    chalk.blue(
      figlet.textSync('Tasky', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
  console.log(chalk.green.bold('Your command-line ToDo list manager\n'));
}

// Main menu
async function mainMenu() {
  const { action } = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: 'Add a new task', value: 'add' },
      { name: 'List all tasks', value: 'list' },
      { name: 'Update a task', value: 'update' },
      { name: 'Mark task as completed', value: 'complete' },
      { name: 'Remove a task', value: 'remove' },
      { name: 'Clear completed tasks', value: 'clear' },
      { name: 'Exit', value: 'exit' },
    ],
  });

  switch (action) {
    case 'add':
      await addTask();
      break;
    case 'list':
      await listTasks();
      break;
    case 'update':
      await updateTask();
      break;
    case 'complete':
      await markComplete();
      break;
    case 'remove':
      await removeTask();
      break;
    case 'clear':
      await clearCompleted();
      break;
    case 'exit':
      process.exit(0);
  }

  await mainMenu();
}

// Add a new task
async function addTask() {
  const spinner = ora('Adding new task...').start();

  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Task title:',
        validate: (input) => input.trim() !== '' || 'Title cannot be empty',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Task description (optional):',
      },
      {
        type: 'input',
        name: 'dueDate',
        message: 'Due date (YYYY-MM-DD):',
        default: dayjs().format('YYYY-MM-DD'),
        validate: (input) => dayjs(input).isValid() || 'Invalid date format',
      },
      {
        type: 'list',
        name: 'priority',
        message: 'Priority:',
        choices: [
          { name: 'High (1)', value: 1 },
          { name: 'Medium (2)', value: 2 },
          { name: 'Low (3)', value: 3 },
        ],
      },
    ]);

    const newTask = {
      id: Date.now().toString(),
      title: answers.title,
      description: answers.description || '',
      dueDate: answers.dueDate,
      createdAt: dayjs().format(),
      priority: answers.priority,
      completed: false,
    };

    // Validate task
    taskSchema.parse(newTask);

    db.data.tasks.push(newTask);
    await db.write();

    spinner.succeed(chalk.green('Task added successfully!'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to add task: ' + error.message));
  }
}

// List all tasks with sorting options
async function listTasks() {
  if (db.data.tasks.length === 0) {
    console.log(chalk.yellow('No tasks found.'));
    return;
  }

  const { sortBy } = await inquirer.prompt({
    type: 'list',
    name: 'sortBy',
    message: 'Sort by:',
    choices: [
      { name: 'Due date', value: 'dueDate' },
      { name: 'Priority', value: 'priority' },
      { name: 'Completion status', value: 'completed' },
      { name: 'Creation date', value: 'createdAt' },
    ],
  });

  const { showCompleted } = await inquirer.prompt({
    type: 'confirm',
    name: 'showCompleted',
    message: 'Show completed tasks?',
    default: true,
  });

  let tasksToDisplay = [...db.data.tasks];
  
  if (!showCompleted) {
    tasksToDisplay = tasksToDisplay.filter(task => !task.completed);
  }

  // Sort tasks
  tasksToDisplay.sort((a, b) => {
    if (sortBy === 'priority') {
      return a.priority - b.priority;
    } else if (sortBy === 'completed') {
      return a.completed === b.completed ? 0 : a.completed ? 1 : -1;
    } else {
      return dayjs(a[sortBy]).isBefore(dayjs(b[sortBy])) ? -1 : 1;
    }
  });

  // Create table
  const table = new Table({
    head: [
      chalk.bold('ID'),
      chalk.bold('Title'),
      chalk.bold('Description'),
      chalk.bold('Due Date'),
      chalk.bold('Priority'),
      chalk.bold('Status'),
    ],
    colWidths: [10, 20, 30, 15, 10, 15],
  });

  tasksToDisplay.forEach((task) => {
    const status = task.completed 
      ? chalk.green('Completed') 
      : chalk.yellow('Pending');
      
    const priorityColor = 
      task.priority === 1 ? chalk.red :
      task.priority === 2 ? chalk.yellow :
      chalk.green;

    table.push([
      task.id,
      task.title,
      task.description,
      dayjs(task.dueDate).format('YYYY-MM-DD'),
      priorityColor(task.priority),
      status,
    ]);
  });

  console.log(table.toString());
}

// Update a task
async function updateTask() {
  if (db.data.tasks.length === 0) {
    console.log(chalk.yellow('No tasks available to update.'));
    return;
  }

  const { taskId } = await inquirer.prompt({
    type: 'list',
    name: 'taskId',
    message: 'Select task to update:',
    choices: db.data.tasks.map((task) => ({
      name: `${task.title} (Due: ${dayjs(task.dueDate).format('YYYY-MM-DD')})`,
      value: task.id,
    })),
  });

  const task = db.data.tasks.find((t) => t.id === taskId);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'New title:',
      default: task.title,
    },
    {
      type: 'input',
      name: 'description',
      message: 'New description:',
      default: task.description,
    },
    {
      type: 'input',
      name: 'dueDate',
      message: 'New due date (YYYY-MM-DD):',
      default: dayjs(task.dueDate).format('YYYY-MM-DD'),
      validate: (input) => dayjs(input).isValid() || 'Invalid date format',
    },
    {
      type: 'list',
      name: 'priority',
      message: 'New priority:',
      default: task.priority,
      choices: [
        { name: 'High (1)', value: 1 },
        { name: 'Medium (2)', value: 2 },
        { name: 'Low (3)', value: 3 },
      ],
    },
  ]);

  const spinner = ora('Updating task...').start();

  try {
    const updatedTask = {
      ...task,
      title: answers.title,
      description: answers.description,
      dueDate: answers.dueDate,
      priority: answers.priority,
    };

    // Validate updated task
    taskSchema.parse(updatedTask);

    const taskIndex = db.data.tasks.findIndex((t) => t.id === taskId);
    db.data.tasks[taskIndex] = updatedTask;
    await db.write();

    spinner.succeed(chalk.green('Task updated successfully!'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to update task: ' + error.message));
  }
}

// Mark task as completed
async function markComplete() {
  const incompleteTasks = db.data.tasks.filter((task) => !task.completed);

  if (incompleteTasks.length === 0) {
    console.log(chalk.yellow('No incomplete tasks available.'));
    return;
  }

  const { taskId } = await inquirer.prompt({
    type: 'list',
    name: 'taskId',
    message: 'Select task to mark as completed:',
    choices: incompleteTasks.map((task) => ({
      name: `${task.title} (Due: ${dayjs(task.dueDate).format('YYYY-MM-DD')})`,
      value: task.id,
    })),
  });

  const spinner = ora('Updating task status...').start();

  try {
    const taskIndex = db.data.tasks.findIndex((t) => t.id === taskId);
    db.data.tasks[taskIndex].completed = true;
    await db.write();

    spinner.succeed(chalk.green('Task marked as completed!'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to update task: ' + error.message));
  }
}

// Remove a task
async function removeTask() {
  if (db.data.tasks.length === 0) {
    console.log(chalk.yellow('No tasks available to remove.'));
    return;
  }

  const { taskId } = await inquirer.prompt({
    type: 'list',
    name: 'taskId',
    message: 'Select task to remove:',
    choices: db.data.tasks.map((task) => ({
      name: `${task.title} (Due: ${dayjs(task.dueDate).format('YYYY-MM-DD')})`,
      value: task.id,
    })),
  });

  const { confirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message: 'Are you sure you want to remove this task?',
    default: false,
  });

  if (!confirm) {
    console.log(chalk.yellow('Task removal cancelled.'));
    return;
  }

  const spinner = ora('Removing task...').start();

  try {
    db.data.tasks = db.data.tasks.filter((task) => task.id !== taskId);
    await db.write();

    spinner.succeed(chalk.green('Task removed successfully!'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to remove task: ' + error.message));
  }
}

// Clear completed tasks
async function clearCompleted() {
  const completedTasks = db.data.tasks.filter((task) => task.completed);

  if (completedTasks.length === 0) {
    console.log(chalk.yellow('No completed tasks to clear.'));
    return;
  }

  const { confirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Are you sure you want to clear ${completedTasks.length} completed task(s)?`,
    default: false,
  });

  if (!confirm) {
    console.log(chalk.yellow('Clear operation cancelled.'));
    return;
  }

  const spinner = ora('Clearing completed tasks...').start();

  try {
    db.data.tasks = db.data.tasks.filter((task) => !task.completed);
    await db.write();

    spinner.succeed(chalk.green(`Cleared ${completedTasks.length} task(s)!`));
  } catch (error) {
    spinner.fail(chalk.red('Failed to clear tasks: ' + error.message));
  }
}

// Main function
async function main() {
  try {
    await initializeDB();
    showWelcome();
    await mainMenu();
  } catch (error) {
    console.error(chalk.red('An error occurred:', error.message));
    process.exit(1);
  }
}

main();
