import shutil
import filecmp
from pathlib import Path
from time import time

main_dir = Path(__file__).resolve().parent
src_dir = main_dir / 'src'
out_dir = main_dir / 'out'

unix_time = str(int(time()))

# Create 'Out' directory
out_dir.mkdir(exist_ok=True)


def copy_to_out_with_name(file: Path, name: str):
    shutil.copy(file, out_dir / name)


def copy_to_out(file: Path):
    copy_to_out_with_name(file, file.name)


def copy_to_out_unique(file: Path):
    copy_to_out_with_name(file, f'{file.stem}-{unix_time}{file.suffix}')


def replace_string(file: Path, init: str, new: str):
    with open(file, 'r') as f:
        cont = f.read()
    cont = cont.replace(init, new)
    with open(file, 'w') as f:
        f.write(cont)


def compare_files_with_replacement(file1: Path, file2: Path, init: str, new: str) -> bool:
    with open(file1, 'r') as f1, open(file2, 'r') as f2:
        return f1.read().replace(init, new) == f2.read()


if __name__ == '__main__':
    RELEASE_FILES = ['trace.js', 'index.html', 'init.js', 'trace.css']
    MAKE_UNIQUE = ['worker.js', 'a.out.wasm']

    worker = None
    wasm = None
    file_time = unix_time
    for file in out_dir.iterdir():
        if 'worker-' in file.stem:
            worker = file
            file_time = file.stem.split('-')[1]
        elif 'a.out-' in file.stem:
            wasm = file

    new_worker_name = f'worker-{file_time}.js'
    new_wasm_name = f'a.out-{file_time}.wasm'

    if not (worker is not None and wasm is not None and compare_files_with_replacement(src_dir / 'worker.js', worker, 'a.out.wasm', new_wasm_name) and filecmp.cmp(src_dir / 'a.out.wasm', wasm)):
        print('New Worker or WASM file detected, replacing with new ones')
        for item in out_dir.iterdir():
            try:
                if item.is_file() or item.is_symlink():
                    item.unlink()
            except Exception as e:
                print(f'Failed to delete {item}. Reason: {e}')
        for file in MAKE_UNIQUE:
            copy_to_out_unique(src_dir / file)
        file_time = unix_time
    else:
        print('No new Worker or WASM file detected, keeping old ones')

    new_worker_name = f'worker-{file_time}.js'
    new_wasm_name = f'a.out-{file_time}.wasm'

    for file in RELEASE_FILES:
        copy_to_out(src_dir / file)

    replace_string(out_dir / 'trace.js', 'worker.js', new_worker_name)
    replace_string(out_dir / new_worker_name, 'a.out.wasm', new_wasm_name)

    print('Done')
