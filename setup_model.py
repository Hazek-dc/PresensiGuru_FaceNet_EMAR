import urllib.request
import bz2
import shutil
import os

os.makedirs('models', exist_ok=True)
url = 'http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2'
bz2_path = 'models/shape_predictor_68_face_landmarks.dat.bz2'
dat_path = 'models/shape_predictor_68_face_landmarks.dat'

print('Downloading...')
urllib.request.urlretrieve(url, bz2_path)

print('Extracting...')
with bz2.BZ2File(bz2_path, 'rb') as source:
    with open(dat_path, 'wb') as target:
        shutil.copyfileobj(source, target)
print('Done.')
