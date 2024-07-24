import shutil
from pathlib import Path
from time import time

src_dir = Path(__file__).resolve().parent / 'src'
out_dir = src_dir / 'out'

unix_time = str(int(time()))

# Create 'Out' directory, or clear all items currently inside 'Out'
if not out_dir.exists():
    out_dir.mkdir()
else:
    for item in out_dir.iterdir():
        try:
            if item.is_file() or item.is_symlink():
                item.unlink()
        except Exception as e:
            print(f'Failed to delete {item}. Reason: {e}')


def copy_to_out(file: Path):
    shutil.copy(file, out_dir / file.name)


def copy_to_out_unique(file: Path):
    dest = out_dir / f'{file.stem}-{unix_time}{file.suffix}'
    shutil.copy(file, dest)


def replace_string(file: Path, init: str, new: str):
    with open(file, 'r') as f:
        cont = f.read()
    cont = cont.replace(init, new)
    with open(file, 'w') as f:
        f.write(cont)


if __name__ == '__main__':
    RELEASE_FILES = ['trace.js', 'index.html', 'init.js', 'trace.css']
    MAKE_UNIQUE = ['worker.js', 'a.out.wasm']

    for file in RELEASE_FILES:
        copy_to_out(src_dir / file)

    for file in MAKE_UNIQUE:
        copy_to_out_unique(src_dir / file)

    new_worker_name = f'worker-{unix_time}.js'
    new_wasm_name = f'a.out-{unix_time}.wasm'

    replace_string(out_dir / 'trace.js', 'worker.js', new_worker_name)
    replace_string(out_dir / new_worker_name, 'a.out.wasm', new_wasm_name)

    print('Done')
