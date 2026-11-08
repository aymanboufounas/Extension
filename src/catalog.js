'use strict';
// Names and categories synchronized with PyBMS 0.2.0's published 100-function API.
const groups = {
  'Datasets': 'load_data from_url read_csv read_json read_excel read_parquet save_data sample_data random_data classification_data regression_data cluster_data split_data shuffle_data batch_data describe_data preview_data select_columns join_data concat_data',
  'Cleaning': 'clean_data clean_names fill_missing drop_missing missing_report drop_duplicates coerce_numbers coerce_dates trim_strings encode_categories scale_data normalize_data clip_outliers drop_outliers outlier_report drop_constant_columns drop_sparse_columns replace_values balance_data validate_data',
  'Arrays': 'array zeros ones random_array reshape flatten one_hot_encode safe_divide moving_average standardize minmax correlation distance top_k array_stats',
  'Plots': 'plot line_plot scatter_plot bar_plot hist_plot box_plot heatmap pie_plot pair_plot missing_plot class_plot loss_plot confusion_plot residual_plot feature_plot',
  'Training': 'infer_task train auto_train compare_models tune_model predict evaluate cross_validate feature_importance save_model load_model recommend_params build_network fit_network explain_model',
  'Optimization': 'gradient_descent numerical_gradient check_gradient learning_rate_schedule clip_gradients initialize_weights sigmoid relu softmax loss_value',
  'Syntax & help': 'check_syntax fix_syntax suggest_function function_help list_functions'
};
const details = {
  load_data:['Load a built-in dataset, CSV, JSON, Excel, Parquet, URL, or DataFrame.', "load_data(source='iris', *, format=None, **kwargs)", "df = pb.load_data('iris')"],
  from_url:['Download a dataset from a direct HTTP(S) URL with limits.',"from_url(url, *, format=None, timeout=20, max_bytes=50000000, **kwargs)", "df = pb.from_url('https://example.org/data.csv')"],
  read_csv:['Read CSV with pandas reader options.', 'read_csv(source, **kwargs)', "df = pb.read_csv('data.csv')"],
  read_json:['Read JSON records, columns, or literal JSON.', 'read_json(source, **kwargs)', "df = pb.read_json('[{\"x\": 1}]')"],
  sample_data:['Load an offline sample dataset.',"sample_data(name='iris')", "df = pb.sample_data('wine')"],
  random_data:['Generate a reproducible numeric DataFrame.', 'random_data(rows=100, columns=4, *, seed=42, missing=0.0)', 'df = pb.random_data(rows=100, columns=4)'],
  classification_data:['Generate labeled classification data.', 'classification_data(rows=100, features=4, *, classes=2, seed=42, **kwargs)', 'df = pb.classification_data(rows=200, features=5)'],
  regression_data:['Generate labeled regression data.', 'regression_data(rows=100, features=4, *, noise=1.0, seed=42, **kwargs)', 'df = pb.regression_data(rows=200, features=3)'],
  split_data:['Split tabular data into train/test sets.', "split_data(data, target='target', *, test_size=0.2, seed=42, stratify=False)", "split = pb.split_data(df, target='target')"],
  describe_data:['Summarize rows, columns, dtypes, missingness and statistics.','describe_data(data)','report = pb.describe_data(df)'],
  clean_data:['Clean a DataFrame; optionally produce a report.', 'clean_data(data, *, target=None, duplicates=True, fill=True, report=False)',"clean, report = pb.clean_data(df, target='target', report=True)"],
  missing_report:['Report missing values per column.','missing_report(data)','print(pb.missing_report(df))'],
  fill_missing:['Impute missing numeric and categorical values.',"fill_missing(data, *, strategy='auto', value=None, names=None)",'df = pb.fill_missing(df)'],
  scale_data:['Scale numeric data, optionally returning the scaler.',"scale_data(data, *, method='standard', names=None, return_scaler=False)",'scaled = pb.scale_data(df)'],
  array:['Create a NumPy array.', 'array(values, *, dtype=float)', 'X = pb.array([[0, 1], [1, 0]])'],
  hist_plot:['Plot histograms of numeric columns.', 'hist_plot(data, *, names=None, bins="auto", **kwargs)', 'ax = pb.hist_plot(df)'],
  scatter_plot:['Create a scatter plot of selected columns.', 'scatter_plot(data, *, x=None, y=None, **kwargs)', 'ax = pb.scatter_plot(df)'],
  heatmap:['Plot a correlation heatmap or numeric matrix.', 'heatmap(data, *, correlation=True, **kwargs)', 'ax = pb.heatmap(df)'],
  train:['Train a specified tabular estimator and evaluate holdout.','train(data, target="target", *, estimator="forest", **kwargs)',"result = pb.train(df, target='target', estimator='forest')"],
  auto_train:['Select and tune tabular estimators using cross-validation, evaluate on holdout.', 'auto_train(data, target="target", *, task="auto", trials=8, **kwargs)',"result = pb.auto_train(df, target='target')"],
  compare_models:['Compare candidate models by cross-validation.', 'compare_models(data, target="target", **kwargs)',"scores = pb.compare_models(df, target='target')"],
  predict:['Predict using a trained PyBMS model or estimator.','predict(model, X)','predictions = pb.predict(result, X)'],
  evaluate:['Evaluate a trained model against labeled examples.', 'evaluate(model, data, y=None, **kwargs)', 'metrics = pb.evaluate(result, data)'],
  save_model:['Save a native NumPy model (.npz) or trusted joblib (.joblib).', 'save_model(model, path)', "pb.save_model(model, 'network.npz')"],
  load_model:['Load a native model or trusted joblib file.', 'load_model(path, *, trusted=False)',"model = pb.load_model('network.npz')"],
  build_network:['Build and compile a native dense network for a task.', 'build_network(input_dim, output_dim, *, task="auto", **kwargs)', 'model = pb.build_network(input_dim=4, output_dim=3, task="multiclass")'],
  gradient_descent:['Optimize a scalar objective with SGD or Adam.', 'gradient_descent(function, initial, **kwargs)', 'minimum = pb.gradient_descent(lambda x: ((x-3)**2).sum(), [10.0, -5.0])'],
  check_syntax:['Parse Python source without execution.','check_syntax(source)',"report = pb.check_syntax('x = [1, 2')"],
  fix_syntax:['Propose conservative repair without overwriting or executing code.', 'fix_syntax(source, *, repair_brackets=True, repair_colons=True, repair_typos=True)',"repair = pb.fix_syntax('import pybms as pb\\nx = pb.array([1, 2]')"],
  suggest_function:['Suggest nearby PyBMS API names.', 'suggest_function(name, *, limit=3, cutoff=0.6)',"pb.suggest_function('cleen_data')"],
  function_help:['Return signature, docs, example and category.','function_help(name)',"help_info = pb.function_help('auto_train')"],
  list_functions:['Return a searchable DataFrame listing 100 workflows.','list_functions(category=None, *, search=None)',"pb.list_functions(category='Cleaning')"]
};
const catalog = Object.entries(groups).flatMap(([category, names]) => names.split(' ').map(name => {
  const [description, signature, example] = details[name] || [
    `${name.replace(/_/g, ' ')} — PyBMS ${category.toLowerCase()} workflow.`,
    `${name}(...)`,
    `result = pb.${name}(...)`
  ];
  return { name, category, description, signature, example };
}));
const map = new Map(catalog.map(entry => [entry.name, entry]));
module.exports = { catalog, groups, map };
