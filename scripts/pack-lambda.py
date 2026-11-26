import os
import zipfile

backend_dir = os.path.abspath('backend')
output_zip = os.path.abspath('marque-lambda.zip')

print(f"Creating {output_zip} from {backend_dir}...")

with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    # Add package.json
    pkg_json = os.path.join(backend_dir, 'package.json')
    if os.path.exists(pkg_json):
        zf.write(pkg_json, 'package.json')
        print("Added package.json")

    # Add dist
    dist_dir = os.path.join(backend_dir, 'dist')
    for root, dirs, files in os.walk(dist_dir):
        for file in files:
            full_path = os.path.join(root, file)
            arcname = os.path.relpath(full_path, backend_dir)
            zf.write(full_path, arcname)
    print("Added dist/")

    # Add node_modules
    nm_dir = os.path.join(backend_dir, 'node_modules')
    for root, dirs, files in os.walk(nm_dir):
        # Skip dev-only caches or tests inside node_modules if present
        for file in files:
            full_path = os.path.join(root, file)
            arcname = os.path.relpath(full_path, backend_dir)
            zf.write(full_path, arcname)
    print("Added node_modules/")

print(f"Done. Archive size: {os.path.getsize(output_zip)} bytes")
