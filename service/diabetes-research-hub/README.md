# Surveilr DRH Data Transformation and SqlPage Preview

## Overview

The `drh-deidentification.sql` performs the deidentification of the columns in
the study data converted tables. The `stateless-drh-surveilr.sql` creates the
database views which shall be used in SQLPage preview. The
`orchestrate-drh-vv.sql` performs the verification and validation on the study
data tables.

**Note: The following are required to preview the Edge UI:**

1. surveilr tool
2. sqlite3 : https://www.sqlite.org/download.html
3. deno runtime:
   https://docs.deno.com/runtime/manual/getting_started/installation/

Steps for installation shall vary based on the operating system

## Getting Started

Note: Try this option outside this repository

1. **Move to folder containing the files:**

   - Open the command prompt and change to the directory containing the files.
   - Command: `cd <folderpath>`
   - Example: `cd D:/workfiles/common-files`

2. **Download Surveilr:**

   - Follow the installation instructions at
     [Surveilr Installation Guide](https://docs.opsfolio.com/surveilr/how-to/installation-guide).
   - Download the tool to this folder.

3. **Verify the Tool Version**

   - Input the command `surveilr --version`.
   - If the tool is available, it will show the version number.

   3.1 **Ingest and transform the Files**

   **Command:**

   - Command:
     `surveilr ingest files -r <foldername>/ && surveilr orchestrate transform-csv`
   - Example:
     `surveilr ingest files -r reference-data/ && surveilr orchestrate transform-csv`

   **Note**: Here `reference-data` is a sub folder within `common-files`
   containing the files.

   3.2 **Verify the Transformed Data**

   - Plese check the folder directly to see the transformed database.

4. **Perform De-identification**

   ```bash
   surveilr orchestrate -n "deidentification" -s https://raw.githubusercontent.com/opsfolio/resource-surveillance-commons/main/service/diabetes-research-hub/de-identification/drh-deidentification.sql
   ```

5. **Perform verification and validation**

   ```bash
   surveilr orchestrate -n "v&v" -s https://raw.githubusercontent.com/opsfolio/resource-surveillance-commons/main/service/diabetes-research-hub/verfication-validation/orchestrate-drh-vv.sql
   ```

6. **Preview Content with SQLPage (requires `deno` v1.40 or above):**

   ```bash
   deno run -A https://raw.githubusercontent.com/opsfolio/resource-surveillance-commons/main/service/diabetes-research-hub/ux.sql.ts | sqlite3 resource-surveillance.sqlite.db
   ```
   ```bash
   surveilr web-ui --port 9000
   ```
   # Launch a browser and go to
   [http://localhost:9000/drh/index.sql](http://localhost:9000/drh/index.sql).

   ## Try it out in this repo (if you're developing SQL scripts)

   **Note**: Reference sample files can be found in the repository folder:
   /service/diabetes-research-hub/study-files.zip

   First, prepare the directory with sample files and copy them to this folder,
   or extract the sample files and move them to this folder:

   ```bash
   $ cd service/diabetes-research-hub
   ```

   The directory should look like this now:

   ```
   ├── de-identification
   |   ├──drh-deidentification.sql
   ├── study-files
   │   ├── author.csv
   │   ├── publication.csv
   │   └── ...many other study files    
   ├── verfication-validation
   |   ├──orchestrate-drh-vv.sql
   ├── stateless-drh-surveilr.sql
   ├── generate-raw-cgm-web-ui-pages.sql
   ```

   Now
   [Download `surveilr`](https://docs.opsfolio.com/surveilr/how-to/installation-guide/)
   into this directory, then ingest and query the data:

   ```bash
   # ingest and transform the CSV files in the "study-files/" directory, creating resource-surveillance.sqlite.db
   $ surveilr ingest files -r study-files/ && surveilr orchestrate transform-csv
   ```

   ````
   ```bash
   # Apply de-identification
   $ cat de-identification/drh-deidentification.sql| surveilr orchestrate -n "deidentification"
   ````

   ```bash
   # Perform verification and validation
   $ cat verfication-validation/orchestrate-drh-vv.sql | surveilr orchestrate -n "v&v"
   ```
   After ingestion, you will only work with these files:

   ```
   ├── stateless-drh-surveilr.sql    
   └── resource-surveillance.sqlite.db            # SQLite database
   ```

   Post-ingestion, `surveilr` is no longer required, the `study-files` directory
   can be ignored, only `sqlite3` is required because all content is in the
   `resource-surveillance.sqlite.db` SQLite database which does not require any
   other dependencies.

   ```bash
   # load the "Console" and other menu/routing utilities   
   $ deno run -A ./ux.sql.ts | sqlite3 resource-surveillance.sqlite.db


   # if you want to start surveilr embedded SQLPage in "watch" mode to re-load files automatically
   $ ../../support/bin/sqlpagectl.ts dev --watch . --watch ../../prime
   # browse http://localhost:9000/ to see web UI

   # if you want to start a standalone SQLPage in "watch" mode to re-load files automatically
   $ ../../support/bin/sqlpagectl.ts dev --watch . --watch ../../prime --standalone
   # browse http://localhost:9000/ to see web UI

   # browse http://localhost:9000/drh/index.sql
   ```

   Once you apply `drh-deidentification.sql` and `orchestrate-drh-vv.sql` you
   can ignore those files and all content will be accessed through views or
   `*.cached` tables in `resource-surveillance.sqlite.db`. The
   `stateless-drh-surveilr.sql` shall be executed within the ux.sql.ts file
   itself. At this point you can rename the SQLite database file, archive it,
   use in reporting tools, DBeaver, DataGrip, or any other SQLite data access
   tools.

   ## Automatically reloading SQL when it changes

   On sandboxes during development and editing of `.sql` or `.sql.ts` you may
   want to automatically re-load the contents into SQLite regularly. Since it
   can be time-consuming to re-run the same command in the CLI manually each
   time a file changes, you can use _watch mode_ instead.

   See: [`sqlpagectl.ts`](../../support/bin/sqlpagectl.ts).
