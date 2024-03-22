import { Tags } from 'exiftool-vendored';
import { useEffect, useState } from 'react';
import './gallery.css';

function App(): JSX.Element {
  // const ipcHandle = (): void => window.electron.ipcRenderer.send('ping');

  const [images, setImg] = useState<Tags[] | null>(null);

  useEffect(() => {
    window.api.readFilesFromDir().then((res) => {
      setImg(res);

      console.log(res);
    });
  }, []);

  return (
    <>
      <section className="images-container">
        {images &&
          images.map((img, index) => (
            <div
              className="image-container"
              key={index}
              style={{
                width: `${(img.ImageWidth! * 175) / img.ImageHeight!}px`,
                flexGrow: `${(img.ImageWidth! * 175) / img.ImageHeight!}`
              }}
            >
              <i
                style={{
                  paddingBottom: `${(img.ImageHeight! / img.ImageWidth!) * 100}%`
                }}
              ></i>
              <img src={`file://${img.SourceFile}`} alt="Image" />
            </div>
          ))}
      </section>
    </>
  );
}

export default App;
