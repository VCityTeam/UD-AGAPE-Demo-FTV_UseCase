import streamlit as st
import metadataPhotoGrouping as mpg
import json
import tempfile
import os

st.title("Download Multiple Images with Metadata")

uploaded_files = st.file_uploader(
    "Upload images", type=["jpg", "jpeg", "png"], accept_multiple_files=True
)

if uploaded_files:
    with tempfile.TemporaryDirectory() as tmpdir:
        saved_files = []
        for uploaded_file in uploaded_files:
            file_path = os.path.join(tmpdir, uploaded_file.name)
            with open(file_path, "wb") as f:
                f.write(uploaded_file.read())
            saved_files.append(file_path)
            #st.write(f"Filename: {uploaded_file.name}, Size: {os.path.getsize(file_path)} bytes")
        
        # Main
        images_with_metadata = mpg.get_images_with_metadata(tmpdir)
        images_groups_by_time = mpg.group_images_by_time(images_with_metadata)
        output_data = mpg.create_output_data(images_groups_by_time)

        # Dictionnaires finaux
        final_media_dictionnary = {"medias": output_data}
        visit_dictionnary = mpg.create_visit_dictionary(images_groups_by_time, output_data)

        st.download_button(
            label="Download mediaConfig.json",
            data=json.dumps(final_media_dictionnary, indent=2),
            file_name="mediaConfig.json",
            mime="application/json"
        )

        st.download_button(
            label="Download visitConfig.json",
            data=json.dumps(visit_dictionnary, indent=2),
            file_name="visitConfig.json",
            mime="application/json"
        )