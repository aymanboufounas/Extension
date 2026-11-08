'use strict';
const templates = [
  {id:'auto',title:'AutoML — Iris',file:'automl_iris.py',description:'Auto-train and inspect held-out metrics',source:`import pybms as pb

# Training and evaluation use separate data partitions.
data = pb.load_data("iris")
result = pb.auto_train(data, target="target")
print("Holdout metrics:", result.metrics)
print("Cross-validation leaderboard:\\n", result.leaderboard)
print("Predictions:", result.predict(data.head()))
`},
  {id:'csv',title:'Train from CSV',file:'train_csv.py',description:'Train on your own tabular dataset',source:`import pybms as pb

# Change the path and target to match YOUR dataset.
data = pb.load_data("data.csv")
print(pb.describe_data(data))
result = pb.auto_train(data, target="target")
print("Holdout metrics:", result.metrics)
pb.save_model(result, "model.joblib")
# WARNING: only load joblib artifacts you trust.
`},
  {id:'clean',title:'Clean and visualize data',file:'clean_visualize.py',description:'Clean, report missingness and save a histogram',source:`import pybms as pb
import matplotlib.pyplot as plt

data = pb.random_data(rows=120, columns=4, missing=0.1)
cleaned, report = pb.clean_data(data, report=True)
print(report)
print(pb.missing_report(data))
ax = pb.hist_plot(cleaned)
ax.figure.savefig("histogram.png", dpi=150)
plt.close(ax.figure)
`},
  {id:'network',title:'Native neural network — XOR',file:'neural_xor.py',description:'Train a NumPy dense network',source:`import pybms as pb

X = pb.array([[0, 0], [0, 1], [1, 0], [1, 1]])
y = pb.array([0, 1, 1, 0])
model = pb.Sequential([
    pb.Dense(8, activation="tanh"),
    pb.Dense(1, activation="sigmoid"),
], seed=7)
model.compile(optimizer="adam", loss="binary_crossentropy", learning_rate=0.03)
model.fit(X, y, epochs=1200, batch_size=4, verbose=0)
print(model.predict(X, classes=True))
model.summary()
`},
  {id:'gradient',title:'Gradient descent',file:'gradient_descent.py',description:'Optimize a simple numerical objective',source:`import pybms as pb

result = pb.gradient_descent(lambda x: ((x - 3) ** 2).sum(), [10.0, -5.0])
print("Minimum:", result.x)
print("Loss:", result.loss)
print("Converged:", result.converged)
`},
  {id:'syntax',title:'Syntax repair demo',file:'syntax_repair.py',description:'Preview conservative PyBMS syntax repairs',source:`import pybms as pb

source = "import pybms as pb\\nx = pb.array([1, 2]"
repair = pb.fix_syntax(source)
print(repair.source)
print(repair.changes)
print("Valid:", repair.valid)
`}
];
module.exports={templates};
