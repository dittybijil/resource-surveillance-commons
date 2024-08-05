import { path, SQLa, SQLPageAide as spa, ws } from "./deps.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

/**
 * Type representing the initialization options for a route.
 *
 * @property path - The path for the route, this the search key when location routes.
 * @property caption - The human friendly name of the route.
 * @property namespace - The namespace for the route, defaults to 'prime'.
 * @property parentPath - The parent path for hierarchical navigation if it's a child.
 * @property siblingOrder - The order of this route among its siblings (for sorting).
 * @property url - The URL for the route if different than the path when displaying in UI.
 * @property abbreviatedCaption - A shorter version of the caption (e.g. for breadcrumbs).
 * @property title - The title for the route (e.g. for page headings).
 * @property description - A description of the route (e.g. for describing in lists or tooltips).
 */
export type RouteInit = {
  readonly path: string;
  readonly caption: string;
  readonly namespace?: string;
  readonly parentPath?: string;
  readonly siblingOrder?: number;
  readonly url?: string;
  readonly abbreviatedCaption?: string;
  readonly title?: string;
  readonly description?: string;
};

/**
 * Type representing a decorated route method, which includes the route
 * initialization options and additional metadata about the method to
 * which the route is attached.
 *
 * @property methodName - The name of the method.
 * @property methodFn - The function of the method.
 * @property methodCtx - The context of the method decorator.
 */
export type DecoratedRouteMethod =
  & RouteInit
  & {
    readonly methodName: string;
    readonly methodFn: Any;
    readonly methodCtx: ClassMethodDecoratorContext<TypicalSqlPageNotebook>;
  };

/**
 * Decorator function for navigation routes. This decorator adds metadata to
 * the method it decorates, which can then be used to generate navigation routes.
 * It stores the RouteInit instance in method's class `navigation` instance.
 *
 * @param routeInit - The initialization options for the route.
 * @returns A decorator function that adds metadata to the method.
 *
 * @example
 * class MyNotebook extends TypicalSqlPageNotebook {
 *   @navigation({
 *     caption: 'Home',
 *     title: 'Homepage',
 *     description: 'The main page of the notebook'
 *   })
 *   index() {
 *     // method implementation
 *   }
 * }
 *
 * - **Default Path**: If no path is provided, it defaults to `/${methodName}`.
 * - **Index Path Handling**: If the path ends with `index.sql`, this part is removed to make searches easier.
 * - **Trailing Slash Removal**: If the path is not the root (`/`) and ends with a slash, the trailing slash is removed.
 * - **URL Generation**: If no URL is provided, a default URL is generated based on the path.
 *
 * Decorators in TypeScript and JavaScript are special functions that can be
 * attached to classes, methods, accessors, properties, or parameters. They
 * allow you to add metadata or modify behavior. In this example, the
 * `navigation` decorator adds route metadata to methods, which can then be
 * used for generating navigation routes.
 */
export function navigation(
  routeInit: Omit<RouteInit, "path"> & Partial<Pick<RouteInit, "path">>,
) {
  const isRoot = (path: string) => path === "/" ? true : false;

  return function (
    methodFn: Any,
    methodCtx: ClassMethodDecoratorContext<TypicalSqlPageNotebook>,
  ) {
    const methodName = String(methodCtx.name);
    let path = routeInit.path ?? `/${methodName}`;

    // special handling for path indexes so searches are easier in table
    if (path.endsWith("index.sql")) {
      path = path.substring(0, path.length - "index.sql".length);
    }
    // the "path" is used to search/locate a nav item so shouldn't have trailing slash
    if (!isRoot(path) && path.endsWith("/")) {
      path = path.substring(0, path.length - 1);
    }

    const drm: DecoratedRouteMethod = {
      ...routeInit,
      path,
      url: routeInit.url ??
        (isRoot(path) ? path : (path.endsWith(".sql") ? path : `${path}/`)),
      methodName,
      methodFn,
      methodCtx,
    };

    methodCtx.addInitializer(function () {
      this.navigation.set(drm.path, drm);
    });

    // return void so that decorated function is not modified
  };
}

export type SqlPageNotebookEmitCtx = SQLa.SqlEmitContext;

/**
 * Base class with helper methods that Resource Surveillance Commons (RSC)
 * sqlpage_files "notebooks" use for typical requirements.
 */
export class TypicalSqlPageNotebook {
  // navigation will be automatically filled by @navigation decorators
  readonly navigation: Map<RouteInit["path"], DecoratedRouteMethod> = new Map();
  readonly emitCtx = SQLa.typicalSqlEmitContext({
    sqlDialect: SQLa.sqliteDialect(),
  }) as SqlPageNotebookEmitCtx;
  readonly ddlOptions = SQLa.typicalSqlTextSupplierOptions<
    SqlPageNotebookEmitCtx
  >();

  // type-safe wrapper for all SQL text generated in this library;
  // we call it `SQL` so that VS code extensions like frigus02.vscode-sql-tagged-template-literals
  // properly syntax-highlight code inside SQL`xyz` strings.
  get SQL() {
    return SQLa.SQL<SqlPageNotebookEmitCtx>(this.ddlOptions);
  }

  upsertNavSQL(...nav: RouteInit[]) {
    const literal = (text?: string | number) =>
      typeof text === "number"
        ? text
        : text
        ? this.emitCtx.sqlTextEmitOptions.quotedLiteral(text)[1]
        : "NULL";
    // deno-fmt-ignore
    return this.SQL`
      INSERT INTO sqlpage_aide_navigation (namespace, parent_path, sibling_order, path, url, caption, abbreviated_caption, title, description)
      VALUES
          ${nav.map(n => `(${[n.namespace ?? 'prime', n.parentPath, n.siblingOrder ?? 1, n.path, n.url, n.caption, n.abbreviatedCaption, n.title, n.description].map(v => literal(v)).join(', ')})`).join(",\n    ")}
      ON CONFLICT (namespace, parent_path, path)
      DO UPDATE SET title = EXCLUDED.title, abbreviated_caption = EXCLUDED.abbreviated_caption, description = EXCLUDED.description, url = EXCLUDED.url, sibling_order = EXCLUDED.sibling_order;`
  }

  /**
   * Assume caller's method name contains "path/path/file.sql" format, reflect
   * the method name in the call stack and extract path components from the
   * method name in the stack trace.
   *
   * @param [level=2] - The stack trace level to extract the method name from. Defaults to 2 (immediate parent).
   * @returns An object containing the absolute path, base name, directory path, and file extension, or undefined if unable to parse.
   */
  sqlPagePathComponents(level = 2) {
    // Get the stack trace using a new Error object
    const stack = new Error().stack;
    if (!stack) {
      return undefined;
    }

    // Split the stack to find the method name
    const stackLines = stack.split("\n");
    if (stackLines.length < 3) {
      return undefined;
    }

    // Parse the method name from the stack trace
    const methodLine = stackLines[level].trim();
    const methodNameMatch = methodLine.match(/at (.+?) \(/);
    if (!methodNameMatch) {
      return undefined;
    }

    // Get the full method name including the class name
    const fullMethodName = methodNameMatch[1];

    // Extract the method name by removing the class name
    const className = this.constructor.name;
    const methodName = fullMethodName.startsWith(className + ".")
      ? fullMethodName.substring(className.length + 1)
      : fullMethodName;

    // assume methodName is now a proper sqlpage_files.path value
    return {
      methodName,
      absPath: "/" + methodName,
      basename: path.basename(methodName),
      path: "/" + path.dirname(methodName),
      extension: path.extname(methodName),
    };
  }

  breadcrumbsSQL(
    activePath: string,
    ...additional: ({ title: string; titleExpr?: never; link?: string } | {
      title?: never;
      titleExpr: string;
      link?: string;
    })[]
  ) {
    return ws.unindentWhitespace(`
        SELECT 'breadcrumb' as component;
        WITH RECURSIVE breadcrumbs AS (
            SELECT 
                COALESCE(abbreviated_caption, caption) AS title,
                COALESCE(url, path) AS link,
                parent_path, 0 AS level,
                namespace
            FROM sqlpage_aide_navigation
            WHERE namespace = 'prime' AND path = '${
      activePath.replaceAll("'", "''")
    }'
            UNION ALL
            SELECT 
                COALESCE(nav.abbreviated_caption, nav.caption) AS title,
                COALESCE(nav.url, nav.path) AS link,
                nav.parent_path, b.level + 1, nav.namespace
            FROM sqlpage_aide_navigation nav
            INNER JOIN breadcrumbs b ON nav.namespace = b.namespace AND nav.path = b.parent_path
        )
        SELECT title, link FROM breadcrumbs ORDER BY level DESC;`) +
      (additional.length
        ? (additional.map((crumb) =>
          `\nSELECT ${
            crumb.title ? `'${crumb.title}'` : crumb.titleExpr
          } AS title, '${crumb.link ?? "#"}' AS link;`
        ))
        : "");
  }

  /**
   * Assume caller's method name contains "path/path/file.sql" format, reflect
   * the method name in the call stack and assume that's the path then compute
   * the breadcrumbs.
   * @param additional any additional crumbs to append
   * @returns the SQL for active breadcrumbs
   */
  activeBreadcrumbsSQL(
    ...additional: ({ title: string; titleExpr?: never; link?: string } | {
      title?: never;
      titleExpr: string;
      link?: string;
    })[]
  ) {
    return this.breadcrumbsSQL(
      this.sqlPagePathComponents(3)?.path ?? "/",
      ...additional,
    );
  }

  /**
   * Assume caller's method name contains "path/path/file.sql" format, reflect
   * the method name in the call stack and assume that's the path then compute
   * the page title.
   * @returns the SQL for page title
   */
  activePageTitle() {
    const literal = (text: string) =>
      this.emitCtx.sqlTextEmitOptions.quotedLiteral(text)[1];
    const activePPC = this.sqlPagePathComponents(3);
    return this.SQL`
          SELECT 'title' AS component, (SELECT COALESCE(title, caption)
              FROM sqlpage_aide_navigation 
             WHERE namespace = 'prime' AND path = ${
      literal(activePPC?.absPath ?? "/")
    }) as contents;
    `;
  }

  /**
   * Assume caller's method name contains "path/path/file.sql" format, reflect
   * the method name in the call stack and assume that's the path then create a
   * link to the page's source in /console/sqlpage-files/*.
   * @returns the SQL for linking to this page's source
   */
  activePageSource() {
    const activePPC = this.sqlPagePathComponents(3);
    const methodName = activePPC?.methodName.replaceAll("'", "''") ?? "??";
    return this.SQL`
        SELECT 'text' AS component, 
               '[View ${methodName}](/console/sqlpage-files/sqlpage-file.sql?path=${methodName})' as contents_md;
  `;
  }

  /**
   * Generate SQL from "method-based" notebooks. Any method that ends in "*.sql"
   * (case sensitive) will be assumed to generate SQL that will be upserted into
   * sqlpage_files and any method name that ends in "DQL" or "DML" or "DDL" (also
   * case sensitive) will be assumed to be general SQL that will be included before
   * all the sqlpage_file upserts.
   * @param sources list of one or more instances of TypicalSqlPageNotebook subclasses
   * @returns an array of strings which are the SQL statements
   */
  static SQL<Source extends TypicalSqlPageNotebook>(...sources: Source[]) {
    return new spa.SQLPageAide(...sources)
      .includeUpserts(/\.sql$/)
      .includeSql(/DQL$/, /DML$/, /DDL$/)
      .onNonStringUpsertContents((result, _sp, method) =>
        SQLa.isSqlTextSupplier(result)
          ? result.SQL(sources[0].emitCtx)
          : `/* unknown result from ${method} */`
      )
      .onNonStringSqlStmt((result, _sp, method) =>
        SQLa.isSqlTextSupplier(result)
          ? result.SQL(sources[0].emitCtx)
          : `/* unknown result from ${method} */`
      )
      .emitformattedSQL()
      .SQL();
  }
}
