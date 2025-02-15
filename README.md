# APM and RUM enablement

This repository is used for training purposes. It contains a set of really small services that communicate with each other.

The goal is to enable everyone to understand the value of APM / Application Observability and RUM / Frontend Observability in Grafana Cloud and to exercise on a small scale what needs to be done to properly set up users for success.

## Prerequisites

- a local machine
- docker installed
- a fresh Grafana Cloud stack (to ensure you can follow all the steps)
- to cache the images, use `docker compose pull && docker compose build`

## How to use this repository

1. clone the repository locally
2. pull & build the docker images needed for this exercise (`docker compose build`)
3. start the app (`docker compose up -d`)
4. browse `http://localhost:8000/`
5. make changes to a service, rebuild and restart (`docker compose up -d`)

## Step 1: Enable RUM and send data to Grafana Cloud

As a first step we want to add faro to the [frontend](./frontend/). To do so, create a new
Frontend Observability application in your Grafana Cloud instance, by opening the following
url: <https://acme.grafana.net/a/grafana-kowalski-app/apps/new> (replace `acme` with your Grafana Cloud org name).

Name your application `app-rum-sample` and add the following domain to the allow list for CORS:

- `http://frontproxy:8000`
- `http://localhost:8000`

Click next, and as the next step requests, install the faro dependencies:

```
npm install @grafana/faro-web-sdk
npm install @grafana/faro-web-tracing
```

Net, open the [App.js](./frontend/src/App.js) in your preferred editor and add the `React` block from
the "Add Faro to your application section", e.g.

```js
import { matchRoutes } from "react-router-dom";
import {
  initializeFaro,
  createReactRouterV6DataOptions,
  ReactIntegration,
  getWebInstrumentations,
} from "@grafana/faro-react";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";
import FaroSourceMapUploaderPlugin from "@grafana/faro-webpack-plugin";

initializeFaro({
  url: "https://faro-collector-prod-eu-west-2.grafana.net/collect/123456789abcdef123456789abcdef0",
  app: {
    name: "app-rum-sample",
    version: "1.0.0",
    environment: "production",
  },

  plugins: [
    // other plugins...
    new FaroSourceMapUploaderPlugin({
      appName: "undefined",
      endpoint: "https://faro-api-prod-eu-west-2.grafana.net/faro/api/v1",
      appId: "undefined",
      stackId: "1155883",
      // instructions on how to obtain your API key are in the documentation
      // https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/sourcemap-upload-plugins/#obtain-an-api-key
      apiKey: "$your-api-key",
      gzipContents: true,
    }),
  ],

  instrumentations: [
    // Mandatory, omits default instrumentations otherwise.
    ...getWebInstrumentations(),

    // Tracing package to get end-to-end visibility for HTTP requests.
    new TracingInstrumentation(),

    // React integration for React applications.
    new ReactIntegration({
      router: createReactRouterV6DataOptions({
        matchRoutes,
      }),
    }),
  ],
});
```

Make sure that you replace `123456789abcdef123456789abcdef0` with your real application key.

Optionally, you can also configure your application to upload source maps for de-obfuscated stack traces:

```
npm install --save-dev @grafana/faro-webpack-plugin
```

Click on `Complete`.

Next, we spin up the application using docker compose. In the root folder of this repository run

```
docker compose up
```

Give the container some time to build. When everything is up and running, go to <http://localhost:8000> in your browser. You can use the developer toolbar to verify that everything is working as expected. Go to the `Network` tab
and check for 2 requests going out to `https://faro-collector-prod-eu-west-2.grafana.net/collect/123456789abcdef123456789abcdef0`, one of type `preflight` and one of type `fetch`.

> [!TIP]
>
> If you see `export 'pageMeta' (reexported as 'pageMeta') was not found in '@grafana/faro-web-sdk'` as an error
> the `frontend` service has some outdated faro dependencies in the `package-lock.json` file. Run `rm -rf package-lock.json node_modules` and `npm install` to fix this issue. You need to rebuild your containers afterwards,
> e.g. run `docker compose up --build --no-deps -d frontend` in a second terminal window

After a while you should see data flowing in, like in the screenshot below

![A screenshot from the Grafana Cloud UI showing data in Frontend Observability](./frontend-app.png)

## Step 2: Add alloy into the mix

In the next step, we want to send the telemetry from our application to an alloy instance first, before sending it to Grafana Cloud. This can be useful if you clients can not access Grafana Cloud, e.g. in a restricted environment.

As a first step, go to `https://acme.grafana.net/connections/add-new-connection/open-telemetry` (replace `acme` with
the name of your Grafana Cloud instance), and create a new token with name `apm-rum-sample`. Click on `Create token`
Scroll down to `Append the generated configuration to your configuration file at /etc/alloy/config.alloy` and copy the generated configuration file to your clipboard and append the content to your [`config.alloy`](./alloy/config.alloy) via paste. Additionally configure a `faro.receiver`. Your configuration file should look like the following:

```
logging {
  level  = "info"
  format = "logfmt"
}

otelcol.receiver.otlp "default" {
	// configures the default grpc endpoint "0.0.0.0:4317"
	grpc { }
	// configures the default http/protobuf endpoint "0.0.0.0:4318"
	http { }

	output {
		metrics = [otelcol.exporter.otlphttp.grafana_cloud.input]
		logs    = [otelcol.exporter.otlphttp.grafana_cloud.input]
		traces  = [otelcol.exporter.otlphttp.grafana_cloud.input]
	}
}


faro.receiver "default" {
    server {
        listen_address = "0.0.0.0"
        cors_allowed_origins = ["http://frontproxy:8000"]
        include_metadata = true
    }

    output {
        logs   = [otelcol.receiver.loki.l2o.receiver]
        traces = [otelcol.exporter.otlphttp.grafana_cloud.input]
    }
}

otelcol.receiver.loki "l2o" {
  output {
    logs = [otelcol.exporter.otlphttp.grafana_cloud.input]
  }
}

otelcol.exporter.otlphttp "grafana_cloud" {
	client {
		endpoint = "https://otlp-gateway-prod-eu-west-2.grafana.net/otlp"
		auth     = otelcol.auth.basic.grafana_cloud.handler
	}
}

otelcol.auth.basic "grafana_cloud" {
	username = "<USERNAME>"
	password = "<PASSWORD>"
}  
```

Replace `<USERNAME>` and `<PASSWORD>`. Save the modified file and restart your alloy container by running
`docker compose restart alloy`. Next, update your [`App.js`](./frontend/src/App.js) to send frontend telemetry
to alloy:

```js
initializeFaro({
  url: 'http://alloy:12347/collect',
  // ...
});
```

When you have setup your application this way logs and traces will flow into your Grafana Cloud instance.

![](./2-logs.png)
![](./2-traces.png)

> [!HINT]
>
> **Question**: It looks like this way it is not possible to populate data into "Frontend Observability". If
> the `https://faro-collector-prod-eu-west-2.grafana.net/collect/<key>` endpoint is used as sink for a loki
> writer and OTLP traces, the loki writer reports issues with missing `X-Faro-Session-Id` header. There was no
> obvious way to reconfigure alloy to send those headers accordingly.

## Step 3: Add backend telemetry

With our frontend instrumented, we also want to add OpenTelemetry to the different backend services for full
end-to-end visibility. There are 3 components: [`frontproxy`](./frontproxy/), [`checkout`](./checkout/) and
[`products`](./products/). We will address them one by one.

### Instrumenting the `frontproxy`

The `frontproxy` is an NGINX. We can use one of the available NGINX OpenTelemetry modules, e.g. [ngx_otel_module](https://github.com/nginxinc/nginx-otel). Adding it to the existing configuration is straight forward, since the docker image we are using has the module already preinstalled. Update the `nginx.conf` with the following content:

```
load_module modules/ngx_otel_module.so;

events {
    use           epoll;
    worker_connections  128;
}

http {
    server_tokens off;
    include       mime.types;
    charset       utf-8;

    server {
        listen        0.0.0.0:8000;

        location /api/products {
            proxy_pass         http://products:8002;
        }

        location /api/checkout {
            proxy_pass         http://checkout:8003;
        }

        location / {
            proxy_pass         http://frontend:8001;
        }
    }

    otel_trace on;
    otel_service_name frontproxy;
    otel_trace_context propagate;
    add_header server-timing "traceparent;desc:\"00-$otel_trace_id-$otel_span_id-0$otel_parent_sampled\"";

    otel_exporter {
        endpoint    alloy:4317;
        interval    5s;
        batch_size  512;
        batch_count 4;
    }
}
```

This enables OpenTelemetry based tracing in the `frontproxy`. It also sets the service name to `frontproxy` and adds 
a config for the `Server-Timing` header to create correlation between frontend and backend.

Restart the `frontproxy`:

```
docker compose restart frontproxy
```

In Grafana Cloud you will now see traces that start in your frontend service (e.g. `app-rum-sample`) and continue in `frontproxy`.

## Instrumenting the checkout service

For the [checkout](./checkout/) service we want to choose a "do not touch my image" approach. This means we will neither edit the application, nor the `Dockerfile` from which the container is generated. This is useful, if you are provided with the container image from a different team or a 3rd party.

Create a new file called `compose.override.yml` with the following content:

```
services:
  frontproxy:
    depends_on:
      - checkout
  
  init-npm:
    image: node:20-alpine
    volumes:
      - npm_modules:/app/node_modules
    working_dir: /app
    command: ["npm", "install", "@opentelemetry/auto-instrumentations-node", "@opentelemetry/instrumentation-winston", "@opentelemetry/winston-transport"]
    restart: "no"

  checkout:
    depends_on:
      init-npm:
        condition: service_completed_successfully
    environment:
      - NODE_PATH=/mnt/node_modules
      - NODE_OPTIONS=-r "@opentelemetry/auto-instrumentations-node/register"
      - OTEL_SERVICE_NAME=checkout
      - OTEL_LOGS_EXPORTER=otlp
      - OTEL_TRACES_EXPORTER=otlp
      - OTEL_NODE_RESOURCE_DETECTORS=env,host,os
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318
    volumes:
      - npm_modules:/mnt/node_modules

volumes:
  npm_modules:
```

> [!NOTE]
>
> The start up time for `checkout` has increased, so `frontproxy` may start before it, so we also need to make
> `checkout` a dependency for `frontproxy` to start.

### Instrumenting the products service

Similarly to the `checkout` service we want to add OpenTelemetry to the `products` service without modifying the
application or Dockerfile. 

Update the `compose.override.yaml` once again by appending the following:

```yaml

```