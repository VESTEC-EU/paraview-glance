import samples from 'paraview-glance/src/samples';
import DragAndDrop from 'paraview-glance/src/components/widgets/DragAndDrop';
import vtkURLExtract from '@kitware/vtk.js/Common/Core/URLExtract';
import Vestec from 'paraview-glance/src/vestec';
import { mapActions } from 'vuex';

function getExtension(filename) {
  const i = filename.lastIndexOf('.');
  if (i > -1) {
    return filename.substr(i + 1).toLowerCase();
  }
  return '';
}

function isSupportedExtension(ext) {
  const supportedExts = ['vtu', 'pvtp'];
  return supportedExts.indexOf(ext) > -1;
}

function getSimulationIDFromComment(comment) {
  // Assuming comments have the following format:
  // "Created by WFA post-processor on archer2 with simulation ID <simulationID>"
  // Returns: "<simulationID>"
  const s = "simulation ID ";
  return comment.substring(comment.indexOf(s) + s.length);
}

export default {
  name: 'Landing',
  components: {
    DragAndDrop,
  },
  data() {
    return {
      samples,
      version: window.GLANCE_VERSION || 'no version available',
    };
  },
  methods: {
    ...mapActions('files', ['openFiles', 'openRemoteFiles']),
    openSample(sample) {
      const urls = [];
      const names = [];
      for (let i = 0; i < sample.datasets.length; ++i) {
        urls.push(sample.datasets[i].url);
        names.push(sample.datasets[i].name);
      }
      this.$emit('open-urls', sample.label, urls, names);
    },
    async vestecLogin() {
      const vestecHost = 'https://vestec.epcc.ed.ac.uk/';

      const userParams = vtkURLExtract.extractURLParameters();
      const vestec = new Vestec(vestecHost);

      const { accessToken, incidentID, simulationID } = userParams;
      if (!accessToken) {
        console.error('no accessToken specified');
        return;
      }
      if (!incidentID) {
        console.error('no incidentID specified');
        return;
      }
      if (!simulationID) {
        console.error('no simulationID specified');
        return;
      }

      vestec.token = accessToken;

      // check if accessToken is still fresh
      const authResponse = await vestec.authorized();
      console.log('Authorized:', authResponse);
      if (!authResponse.ok || !authResponse.status == 200) {
        console.error('AccessToken not valid');
        return;
      }

      const datasets = await vestec
        .getIncident(incidentID)
        .then((res) => res.body.getReader().read())
        .then((data) => {
          const uint8array = data.value;
          const str = new TextDecoder().decode(uint8array);
          return JSON.parse(str).data_sets;
        });

      // filter datasets by their extension and simulationID
      const validDatasets = datasets.filter(
        (ds) =>
          isSupportedExtension(getExtension(ds.name)) &&
          getSimulationIDFromComment(ds.comment) === simulationID
      );

      const options = {
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
      };

      const datasetsToLoad = validDatasets.map((ds) => ({
        name: ds.name,
        ...vestec.buildRequestInit(`data/${ds.uuid}`),
        options,
      }));

      this.openRemoteFiles(datasetsToLoad);
      this.$emit('open');
    },
  },
  mounted() {
    this.vestecLogin();
  },
};
