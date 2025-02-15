import { Route, BrowserRouter as Router, Link } from "react-router-dom";

import "./App.css";

import { PlaceOrderPage } from "./components/PlaceOrderPage";
import { ProductsPage } from "./components/ProductsPage";
import { WelcomePage } from "./components/WelcomePage";

import {
  createRoutesFromChildren,
  matchRoutes,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import {
  initializeFaro,
  createReactRouterV6DataOptions,
  ReactIntegration,
  getWebInstrumentations,
} from "@grafana/faro-react";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";

initializeFaro({
  url: 'http://alloy:12347/collect',
  app: {
    name: "app-rum-sample",
    version: "1.0.0",
    environment: "production",
  },

  instrumentations: [
    // Mandatory, omits default instrumentations otherwise.
    ...getWebInstrumentations(),

    // Tracing package to get end-to-end visibility for HTTP requests.
    new TracingInstrumentation(),
  ],
});

function App() {
  return (
    <div className="app">
      <Router>
        <div className="list">
          <ul>
            <li>
              <Link to="/">Welcome</Link>
            </li>
            <li>
              <Link to="products">Products</Link>
            </li>
            <li>
              <Link to="order">Place order</Link>
            </li>
          </ul>
        </div>
        <Routes>
          <Route exact path="/" element={<WelcomePage />} />
          <Route exact path="products" element={<ProductsPage />} />
          <Route exact path="order" element={<PlaceOrderPage />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
